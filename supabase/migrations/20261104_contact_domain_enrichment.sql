-- Contacts → company enrichment by email domain (Clay), with a per-domain cache.
--
-- Clay's Search API looks a company up by DOMAIN and every search spends the
-- period quota, so enrichment is keyed on the contact's email domain:
--   * one search per company domain fills every contact at that company;
--   * each domain is searched at most once (found / not_found are final;
--     'failed' — timeout, HTTP error — may be retried later);
--   * personal mailboxes (hotmail, gmail, btinternet…) are never searched —
--     there is no company behind them;
--   * domains that already have an enriched contact are seeded from that
--     contact for free (source = 'contacts'), no Clay search at all.
-- Applying a cached row only FILLS EMPTY fields (and a sector for an
-- unsegmented contact) — never overwrites stored data, same rule as the CSV
-- import. Contact linkedin_url is a PERSON field, so the company's LinkedIn
-- stays in the cache and is not copied onto contacts.
--
-- The functions are SECURITY DEFINER and executable by service_role only; the
-- admin API route (/api/admin/contacts/enrich) checks the caller is an admin.

-- ── Cache ────────────────────────────────────────────────────
create table if not exists public.contact_domain_enrichments (
  domain          text primary key,
  status          text not null check (status in ('found', 'not_found', 'failed')),
  source          text not null default 'clay' check (source in ('clay', 'contacts')),
  company_name    text,
  industry_raw    text,
  sector          text references public.contact_sectors(key) on update cascade,
  website         text,
  linkedin_url    text,            -- the COMPANY page (not copied onto contacts)
  company_size    text,
  employee_count  integer,
  description     text,
  error           text,
  raw             jsonb,
  searched_at     timestamptz not null default now()
);

alter table public.contact_domain_enrichments enable row level security;
drop policy if exists "Admins read contact_domain_enrichments" on public.contact_domain_enrichments;
create policy "Admins read contact_domain_enrichments"
  on public.contact_domain_enrichments for select
  using (public.is_admin());

-- ── Helpers ──────────────────────────────────────────────────
create or replace function public.contact_email_domain(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(split_part(coalesce(p_email, ''), '@', 2))), '')
$$;

-- Consumer / ISP mailboxes — nothing for Clay to look up. Matches the
-- provider label anywhere in the host, so every country variant and mail
-- subdomain is covered (hotmail.com, hotmail.co.uk, yahoo.fr,
-- blackberry.orange.co.uk…).
create or replace function public.contact_is_personal_domain(p_domain text)
returns boolean
language sql
immutable
as $$
  select p_domain is null
    or p_domain ~ ('(^|\.)(gmail|googlemail|hotmail|outlook|live|msn|passport|yahoo|ymail|rocketmail|'
                   || 'icloud|me|mac|aol|aim|btinternet|btconnect|btopenworld|bt|sky|virginmedia|virgin|'
                   || 'ntlworld|talktalk|talk21|blueyonder|tiscali|tiscali-uk|mail|email|gmx|web|'
                   || 'protonmail|proton|pm|zoho|orange|wanadoo|o2|fsmail|freeserve|lineone|tesco|'
                   || 'uwclub|yandex|qq|163|126|sina|hushmail|fastmail|inbox|onetel|supanet|'
                   || 'madasafish|ukonline|globalnet|waitrose|plus|plusnet|clara|eclipse|homecall|'
                   || 'freenet|libero|hotmai|hotmial|gmial|outook|o2email|privaterelay|tripleseat)\.')
$$;

-- Rows still missing company data (contact linkedin_url is a person field,
-- so it doesn't count).
create or replace function public.contact_needs_company_data(c public.contacts)
returns boolean
language sql
immutable
as $$
  select nullif(trim(coalesce(c.company_name, '')), '') is null
      or nullif(trim(coalesce(c.industry_raw, '')), '') is null
      or nullif(trim(coalesce(c.website, '')), '') is null
      or nullif(trim(coalesce(c.company_size, '')), '') is null
      or c.sector = 'unsegmented'
$$;

create index if not exists idx_contacts_email_domain
  on public.contacts (public.contact_email_domain(email));

-- Every function below takes an optional p_ids: the contacts the admin
-- selected on the Contacts screen. null = the whole table. "Known companies"
-- (for the free copy) are always looked up across ALL contacts — a selected
-- person's colleague doesn't need to be selected too.
drop function if exists public.contact_enrichment_plan();
drop function if exists public.contact_enrichment_seed();
drop function if exists public.contact_enrichment_apply(text[]);
drop function if exists public.contact_enrichment_next_domains(integer);

-- Business domains that already have an enriched contact (company + industry).
create or replace function public.contact_known_company_domains()
returns table (domain text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct public.contact_email_domain(email)
  from public.contacts
  where nullif(trim(coalesce(company_name, '')), '') is not null
    and nullif(trim(coalesce(industry_raw, '')), '') is not null
    and not public.contact_is_personal_domain(public.contact_email_domain(email))
$$;

-- ── Plan: the numbers the Enrich dialog shows ────────────────
create or replace function public.contact_enrichment_plan(p_ids uuid[] default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select public.contact_email_domain(email) as d,
           public.contact_needs_company_data(contacts) as incomplete
    from public.contacts
    where p_ids is null or id = any(p_ids)
  ),
  b as (select * from c where not public.contact_is_personal_domain(d)),
  inc as (select d, count(*) as n from b where incomplete group by d),
  known as (select domain as d from public.contact_known_company_domains()),
  done as (
    select domain from public.contact_domain_enrichments where status in ('found', 'not_found')
  )
  select jsonb_build_object(
    'scoped',              p_ids is not null,
    'total_contacts',      (select count(*) from c),
    'personal_contacts',   (select count(*) from c where public.contact_is_personal_domain(d)),
    'business_contacts',   (select count(*) from b),
    'incomplete_contacts', (select coalesce(sum(n), 0) from inc),
    'incomplete_domains',  (select count(*) from inc),
    'free_contacts',       (select coalesce(sum(n), 0) from inc
                             where d in (select d from known) and d not in (select domain from done)),
    'free_domains',        (select count(*) from inc
                             where d in (select d from known) and d not in (select domain from done)),
    'pending_contacts',    (select coalesce(sum(n), 0) from inc
                             where d not in (select d from known) and d not in (select domain from done)),
    'pending_domains',     (select count(*) from inc
                             where d not in (select d from known) and d not in (select domain from done)),
    'clay_found',          (select count(*) from public.contact_domain_enrichments where source = 'clay' and status = 'found'),
    'clay_not_found',      (select count(*) from public.contact_domain_enrichments where source = 'clay' and status = 'not_found'),
    'clay_failed',         (select count(*) from public.contact_domain_enrichments where source = 'clay' and status = 'failed')
  )
$$;

-- ── Seed: copy company data from colleagues already enriched (free) ──
-- One cache row per business domain that has an enriched contact, taken from
-- that domain's most complete contact. Never touches a domain already cached.
-- With p_ids, only the selected contacts' domains are seeded.
create or replace function public.contact_enrichment_seed(p_ids uuid[] default null)
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with scope as (
    select distinct public.contact_email_domain(email) as d
    from public.contacts
    where p_ids is null or id = any(p_ids)
  ),
  src as (
    select distinct on (public.contact_email_domain(email))
           public.contact_email_domain(email) as d,
           nullif(trim(company_name), '') as company_name,
           nullif(trim(industry_raw), '') as industry_raw,
           nullif(sector, 'unsegmented') as sector,
           nullif(trim(website), '') as website,
           nullif(trim(company_size), '') as company_size,
           employee_count
    from public.contacts
    where nullif(trim(coalesce(company_name, '')), '') is not null
      and nullif(trim(coalesce(industry_raw, '')), '') is not null
      and not public.contact_is_personal_domain(public.contact_email_domain(email))
      and public.contact_email_domain(email) in (select d from scope)
    order by public.contact_email_domain(email),
             ((website is not null)::int + (company_size is not null)::int
              + (employee_count is not null)::int + (sector <> 'unsegmented')::int) desc,
             updated_at desc
  ),
  ins as (
    insert into public.contact_domain_enrichments
      (domain, status, source, company_name, industry_raw, sector, website, company_size, employee_count)
    select d, 'found', 'contacts', company_name, industry_raw, sector, website, company_size, employee_count
    from src
    where d is not null
    on conflict (domain) do nothing
    returning 1
  )
  select count(*)::int from ins
$$;

-- ── Apply cached company data to contacts (fill empty fields only) ──
-- p_domains = null → every cached domain; p_ids = null → every contact.
create or replace function public.contact_enrichment_apply(p_domains text[] default null, p_ids uuid[] default null)
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with upd as (
    update public.contacts c set
      company_name   = coalesce(nullif(trim(c.company_name), ''), e.company_name),
      industry_raw   = coalesce(nullif(trim(c.industry_raw), ''), e.industry_raw),
      website        = coalesce(nullif(trim(c.website), ''), e.website),
      company_size   = coalesce(nullif(trim(c.company_size), ''), e.company_size),
      employee_count = coalesce(c.employee_count, e.employee_count),
      sector         = case when c.sector = 'unsegmented' and e.sector is not null then e.sector else c.sector end
    from public.contact_domain_enrichments e
    where e.status = 'found'
      and e.domain = public.contact_email_domain(c.email)
      and (p_domains is null or e.domain = any(p_domains))
      and (p_ids is null or c.id = any(p_ids))
      and (
           (nullif(trim(coalesce(c.company_name, '')), '') is null and e.company_name is not null)
        or (nullif(trim(coalesce(c.industry_raw, '')), '') is null and e.industry_raw is not null)
        or (nullif(trim(coalesce(c.website, '')), '') is null and e.website is not null)
        or (nullif(trim(coalesce(c.company_size, '')), '') is null and e.company_size is not null)
        or (c.employee_count is null and e.employee_count is not null)
        or (c.sector = 'unsegmented' and e.sector is not null)
      )
    returning 1
  )
  select count(*)::int from upd
$$;

-- ── Next domains for Clay: most contacts first (best value per search) ──
-- Skips domains already searched (found / not_found), domains we can seed for
-- free, and domains whose last search FAILED within the hour (so a broken
-- domain can't loop inside one run). With p_ids, only the selected contacts.
create or replace function public.contact_enrichment_next_domains(p_limit integer, p_ids uuid[] default null)
returns table (domain text, contacts bigint)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select public.contact_email_domain(email) as d
    from public.contacts
    where (p_ids is null or id = any(p_ids))
      and public.contact_needs_company_data(contacts)
  )
  select b.d as domain, count(*) as contacts
  from b
  where b.d is not null
    and not public.contact_is_personal_domain(b.d)
    and b.d not in (select k.domain from public.contact_known_company_domains() k)
    and not exists (
      select 1 from public.contact_domain_enrichments e
      where e.domain = b.d
        and (e.status in ('found', 'not_found') or e.searched_at > now() - interval '1 hour')
    )
  group by b.d
  order by count(*) desc, b.d
  limit greatest(1, least(coalesce(p_limit, 1), 50))
$$;

revoke all on function public.contact_known_company_domains() from public, anon, authenticated;
revoke all on function public.contact_enrichment_plan(uuid[]) from public, anon, authenticated;
revoke all on function public.contact_enrichment_seed(uuid[]) from public, anon, authenticated;
revoke all on function public.contact_enrichment_apply(text[], uuid[]) from public, anon, authenticated;
revoke all on function public.contact_enrichment_next_domains(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.contact_known_company_domains() to service_role;
grant execute on function public.contact_enrichment_plan(uuid[]) to service_role;
grant execute on function public.contact_enrichment_seed(uuid[]) to service_role;
grant execute on function public.contact_enrichment_apply(text[], uuid[]) to service_role;
grant execute on function public.contact_enrichment_next_domains(integer, uuid[]) to service_role;

-- ── Per-contact outcome for a selection (the dialog's result list) ──
create or replace function public.contact_enrichment_results(p_ids uuid[])
returns table (
  id uuid, email text, first_name text, last_name text, company_name text, sector text,
  personal boolean, needs_data boolean, lookup_status text, lookup_source text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.email, c.first_name, c.last_name, c.company_name, c.sector,
         public.contact_is_personal_domain(public.contact_email_domain(c.email)),
         public.contact_needs_company_data(c),
         e.status, e.source
  from public.contacts c
  left join public.contact_domain_enrichments e on e.domain = public.contact_email_domain(c.email)
  where c.id = any(p_ids)
  order by c.created_at desc
  limit 200
$$;

revoke all on function public.contact_enrichment_results(uuid[]) from public, anon, authenticated;
grant execute on function public.contact_enrichment_results(uuid[]) to service_role;
