-- ============================================================
-- 20260806_contacts.sql
--   Contacts — the club's general contact/prospect database.
--
-- WHY A SEPARATE TABLE (not members)
--   These ~11k rows are contacts/prospects, NOT paying members: event guests,
--   past enquiries, leads and email-list people (me&u export + Sarah's own
--   address book, enriched through Clay). Importing them as members would
--   create 11k auth logins plus membership records with tiers, quotas and
--   renewal dates — polluting the real membership base. So they live here.
--
-- WHY sector/subscribe ARE REAL COLUMNS (not tags)
--   Segmenting by sector is the whole point of the module, and the marketing
--   segments + sponsorship warm-pool features need to query them cheaply.
--   Tags can't do that without a join per filter.
--
-- IDENTITY
--   lower(email) is the unique key. Import upserts on it, so re-running an
--   import never duplicates. The merge rule (blank never overwrites a stored
--   value) lives in the import API, not here.
--
-- New tables are written by the untyped service-role client, so they are
-- intentionally absent from src/types/database.ts.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── contact_sectors ──────────────────────────────────────────
-- The canonical sector shortlist. A reference table (not an enum) so the list
-- can be edited from the admin UI without a migration.
create table if not exists public.contact_sectors (
  key         text primary key,                  -- 'hospitality'
  label       text not null,                     -- 'Hospitality'
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.contact_sectors enable row level security;

drop policy if exists "Admins manage contact_sectors" on public.contact_sectors;
create policy "Admins manage contact_sectors"
  on public.contact_sectors for all
  using (public.is_admin()) with check (public.is_admin());

-- The 14 sectors derived from the real Clay `Industry` values (100% of the
-- 1,725 enriched rows map onto these), plus the Unsegmented bucket for the
-- ~83% of contacts with nothing to classify from yet.
insert into public.contact_sectors (key, label, sort_order) values
  ('hospitality',   'Hospitality',                10),
  ('financial',     'Financial Services',         20),
  ('property',      'Property',                   30),
  ('legal',         'Legal',                      40),
  ('retail',        'Retail & Luxury',            50),
  ('events',        'Events & Entertainment',     60),
  ('marketing',     'Marketing & Media',          70),
  ('technology',    'Technology',                 80),
  ('professional',  'Professional Services',      90),
  ('health',        'Health & Wellness',         100),
  ('automotive',    'Automotive',                110),
  ('travel',        'Travel & Aviation',         120),
  ('nonprofit',     'Non-profit & Public',       130),
  ('industrial',    'Manufacturing & Industrial',140),
  ('unsegmented',   'Unsegmented',               999)
on conflict (key) do update
  set label = excluded.label, sort_order = excluded.sort_order;

-- ── contacts ─────────────────────────────────────────────────
create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),

  -- Identity
  email             text not null,
  first_name        text,
  last_name         text,

  -- Company / enrichment (Clay fills most of these)
  company_name      text,
  job_title         text,
  website           text,
  industry_raw      text,                        -- the original Clay/source string, kept for audit
  employee_count    integer,
  company_size      text,                        -- Clay's banded 'Size' (e.g. '11-50')
  linkedin_url      text,

  -- Segmentation
  sector            text not null default 'unsegmented'
                      references public.contact_sectors(key) on update cascade,

  -- Contact detail
  phone             text,
  city              text,
  location          text,

  -- Marketing consent. 35% of the source list opted out — never email them.
  email_subscribed  boolean not null default true,
  sms_subscribed    boolean not null default true,
  unsubscribed_at   timestamptz,

  -- Provenance
  source            text,                        -- e.g. 'me&u', 'csv-import'
  groups            text[] not null default '{}',-- real tags only (Leeds, Manchester, RalphLauren…)
  is_member_flag    boolean not null default false, -- Clay's "Is Current Member"
  member_id         uuid references public.members(id) on delete set null,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Identity key — case-insensitive, so the importer can upsert on it.
create unique index if not exists uq_contacts_email
  on public.contacts (lower(email));

-- Sector filter is the primary UI query.
create index if not exists idx_contacts_sector on public.contacts (sector);
create index if not exists idx_contacts_subscribed on public.contacts (email_subscribed);
create index if not exists idx_contacts_company on public.contacts (lower(company_name));
create index if not exists idx_contacts_created on public.contacts (created_at desc);

-- Search across name / email / company, used by the list's search box.
create index if not exists idx_contacts_search on public.contacts
  using gin (to_tsvector('simple',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
    coalesce(email,'')      || ' ' || coalesce(company_name,'')));

alter table public.contacts enable row level security;

drop policy if exists "Admins manage contacts" on public.contacts;
create policy "Admins manage contacts"
  on public.contacts for all
  using (public.is_admin()) with check (public.is_admin());

-- Keep updated_at honest. Reuses the app-wide trigger fn where present.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'handle_updated_at') then
    drop trigger if exists set_updated_at on public.contacts;
    create trigger set_updated_at
      before update on public.contacts
      for each row execute function public.handle_updated_at();
  end if;
end $$;

-- ── contact_imports ──────────────────────────────────────────
-- One row per CSV upload, so an import is auditable and the preview→commit
-- flow has somewhere to report its counts.
create table if not exists public.contact_imports (
  id             uuid primary key default gen_random_uuid(),
  filename       text,
  total_rows     integer not null default 0,
  inserted_count integer not null default 0,
  updated_count  integer not null default 0,
  skipped_count  integer not null default 0,
  error_rows     jsonb   not null default '[]'::jsonb,
  imported_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.contact_imports enable row level security;

drop policy if exists "Admins manage contact_imports" on public.contact_imports;
create policy "Admins manage contact_imports"
  on public.contact_imports for all
  using (public.is_admin()) with check (public.is_admin());
