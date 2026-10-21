-- ============================================================
-- 20261022_directory_contact_intros.sql
--   Member Directory → "Wider network": members browse the club's CRM
--   contacts (name, company, role, sector only) and ask Sarah for an
--   introduction.
--
-- PRIVACY MODEL
--   Members never read `contacts` or `contact_intro_requests` directly — both
--   stay admin-only under is_admin() RLS. All member access goes through the
--   /api/portal/directory/* routes, which call the two functions below with
--   the service-role key. The functions return ONLY id, first/last name,
--   company, job title and sector label — no email, phone, links, notes,
--   location, source or groups. EXECUTE is revoked from anon/authenticated so
--   a member's own JWT can't call them over PostgREST either.
--
-- Fully guarded — safe to run twice. No data is modified.
-- ============================================================

-- ── contacts.directory_hidden ────────────────────────────────
-- Admin switch (contact drawer) to keep a contact out of the member directory.
alter table public.contacts
  add column if not exists directory_hidden boolean not null default false;

-- Keyset index for the directory list: ordered by lower("last first"), id,
-- restricted to the rows the directory can ever show.
create index if not exists idx_contacts_directory_sort
  on public.contacts (
    (lower(coalesce(last_name, '') || ' ' || coalesce(first_name, ''))),
    id
  )
  where directory_hidden = false
    and member_id is null
    and is_member_flag = false;

-- ── contact_intro_requests ───────────────────────────────────
create table if not exists public.contact_intro_requests (
  id                   uuid primary key default gen_random_uuid(),
  requester_member_id  uuid not null references public.members(id) on delete cascade,
  contact_id           uuid not null references public.contacts(id) on delete cascade,
  reason               text,
  desired_outcome      text,
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'declined', 'completed')),
  handled_by           uuid references public.profiles(id) on delete set null,
  handled_at           timestamptz,
  admin_note           text,
  created_at           timestamptz not null default now()
);

-- One open (pending) request per member → contact pair.
create unique index if not exists uq_contact_intro_requests_pending
  on public.contact_intro_requests (requester_member_id, contact_id)
  where status = 'pending';

create index if not exists idx_contact_intro_requests_status
  on public.contact_intro_requests (status, created_at desc);
create index if not exists idx_contact_intro_requests_contact
  on public.contact_intro_requests (contact_id);

alter table public.contact_intro_requests enable row level security;

-- Admins only. Deliberately NO member policy: members reach this table only
-- through the API routes (service role).
drop policy if exists "Admins manage contact_intro_requests" on public.contact_intro_requests;
create policy "Admins manage contact_intro_requests"
  on public.contact_intro_requests for all
  using (public.is_admin()) with check (public.is_admin());

-- ── directory_contacts() ─────────────────────────────────────
-- One keyset page of the wider-network directory. `requested` is true when
-- p_requester already has a pending/approved request for that contact.
create or replace function public.directory_contacts(
  p_q          text default null,
  p_sector     text default null,
  p_after_key  text default null,
  p_after_id   uuid default null,
  p_limit      integer default 24,
  p_requester  uuid default null
)
returns table (
  id            uuid,
  first_name    text,
  last_name     text,
  company_name  text,
  job_title     text,
  sector_key    text,
  sector_label  text,
  sort_key      text,
  requested     boolean
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.first_name,
    c.last_name,
    c.company_name,
    c.job_title,
    c.sector,
    s.label,
    lower(coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '')) as sort_key,
    (p_requester is not null and exists (
      select 1 from public.contact_intro_requests r
      where r.contact_id = c.id
        and r.requester_member_id = p_requester
        and r.status in ('pending', 'approved')
    )) as requested
  from public.contacts c
  left join public.contact_sectors s on s.key = c.sector
  where c.directory_hidden = false
    and c.member_id is null
    and c.is_member_flag = false
    and nullif(btrim(c.first_name), '') is not null
    and nullif(btrim(c.last_name), '') is not null
    and (p_sector is null or c.sector = p_sector)
    and (
      p_q is null
      or lower(c.first_name || ' ' || c.last_name) like '%' || lower(p_q) || '%'
      or lower(coalesce(c.company_name, '')) like '%' || lower(p_q) || '%'
      or lower(coalesce(c.job_title, '')) like '%' || lower(p_q) || '%'
    )
    and (
      p_after_key is null
      or (lower(coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '')), c.id)
           > (p_after_key, p_after_id)
    )
  order by lower(coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '')), c.id
  -- 51 = the API's 50-row page cap + one look-ahead row for "has more".
  limit least(greatest(coalesce(p_limit, 24), 1), 51);
$$;

-- ── directory_contact_sectors() ──────────────────────────────
-- Sector filter options with the number of listable contacts in each.
create or replace function public.directory_contact_sectors()
returns table (key text, label text, sort_order integer, contact_count bigint)
language sql
stable
set search_path = public
as $$
  select s.key, s.label, s.sort_order, count(c.id) as contact_count
  from public.contact_sectors s
  join public.contacts c on c.sector = s.key
  where c.directory_hidden = false
    and c.member_id is null
    and c.is_member_flag = false
    and nullif(btrim(c.first_name), '') is not null
    and nullif(btrim(c.last_name), '') is not null
  group by s.key, s.label, s.sort_order
  order by s.sort_order, s.label;
$$;

-- Service role only — never callable with a member's (or anon) JWT.
revoke all on function public.directory_contacts(text, text, text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.directory_contact_sectors() from public, anon, authenticated;
grant execute on function public.directory_contacts(text, text, text, uuid, integer, uuid) to service_role;
grant execute on function public.directory_contact_sectors() to service_role;
