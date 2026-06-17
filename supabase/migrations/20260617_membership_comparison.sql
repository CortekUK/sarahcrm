-- ============================================================
-- 20260617_membership_comparison.sql
--
-- CMS-managed "Membership comparison" spec sheet that renders in the
-- ComparisonTable on /memberships. One row per feature, with a boolean
-- "included" flag for each of the three public tiers
-- (Individual / Business / Corporate). Editors manage rows from
-- /dashboard/website/membership-comparison — add / edit / reorder /
-- delete / toggle active.
--
-- Unlike membership_benefits (a fixed set of 9), this table is fully
-- editable: INSERT and DELETE are granted to admins so rows can be
-- added or removed as the offering changes. The public page falls back
-- to a hardcoded COMPARISON constant if this table is empty/absent, so
-- nothing breaks before the migration is applied.
-- ============================================================

create table if not exists public.membership_comparison (
  id uuid default gen_random_uuid() primary key,
  -- The feature label shown in the left-hand column.
  label text not null,
  -- Whether the feature is included for each tier. These map 1:1 to the
  -- existing `cells: [boolean, boolean, boolean]` tuple in the hardcoded
  -- COMPARISON constant (Individual, Business, Corporate).
  individual boolean not null default false,
  business boolean not null default false,
  corporate boolean not null default false,
  -- Lower numbers render first. Matches the membership_plans pattern.
  display_order int not null default 0,
  -- Hide a row from the public table without deleting it.
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists membership_comparison_display_order_idx
  on public.membership_comparison (display_order);

-- ── Updated-at trigger ──────────────────────────────────────
create or replace function public.touch_membership_comparison()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists membership_comparison_touch on public.membership_comparison;
create trigger membership_comparison_touch
  before update on public.membership_comparison
  for each row execute function public.touch_membership_comparison();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.membership_comparison enable row level security;

-- Public read — only active rows. Anyone hitting /memberships gets the
-- curated comparison with no auth.
drop policy if exists "Public read membership_comparison" on public.membership_comparison;
create policy "Public read membership_comparison"
  on public.membership_comparison
  for select
  using (is_active = true);

-- Admins can read everything (including inactive) and fully manage rows.
drop policy if exists "Admin read membership_comparison" on public.membership_comparison;
create policy "Admin read membership_comparison"
  on public.membership_comparison
  for select
  using (public.is_admin());

drop policy if exists "Admin insert membership_comparison" on public.membership_comparison;
create policy "Admin insert membership_comparison"
  on public.membership_comparison
  for insert
  with check (public.is_admin());

drop policy if exists "Admin update membership_comparison" on public.membership_comparison;
create policy "Admin update membership_comparison"
  on public.membership_comparison
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin delete membership_comparison" on public.membership_comparison;
create policy "Admin delete membership_comparison"
  on public.membership_comparison
  for delete
  using (public.is_admin());

-- ── Seed: the fourteen comparison rows, verbatim from the public page ─
-- Only seeds when the table is empty so re-running the migration (or
-- running it after editors have curated the list) never tramples their
-- changes or duplicates rows.
insert into public.membership_comparison (label, individual, business, corporate, display_order)
select * from (values
  ('Access to The Club network', true, true, true, 0),
  ('Single membership for one individual', true, false, false, 1),
  ('Up to 4 memberships', false, true, true, 2),
  ('Advertising on Member''s Directory and website', true, true, true, 3),
  ('Access to The Club Member''s Events', true, true, true, 4),
  ('"Work in" Mondays with The Club members', true, true, true, 5),
  ('Exclusive member rates for private dining experiences', true, true, true, 6),
  ('Exclusive members rates for bespoke and ticketed events', true, true, true, 7),
  ('Access to The Club concierge service', false, true, true, 8),
  ('1 event curated for your business with sponsorship (all costs included)', false, true, false, 9),
  ('4 events curated for your business with sponsorship (based on agreed budget and requirements)', false, false, true, 10),
  ('Bespoke marketing campaign', false, false, true, 11),
  ('Exclusivity — only one business per sector during your membership term', false, false, true, 12),
  ('Top level concierge services including designated team and guest management', false, false, true, 13)
) as seed(label, individual, business, corporate, display_order)
where not exists (select 1 from public.membership_comparison);
