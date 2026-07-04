-- ============================================================
-- 20260616_membership_plans_table.sql
--
-- CATCH-UP MIGRATION — brings the migration folder in line with the
-- live database.
--
-- `membership_plans` exists on the live DB but its CREATE TABLE was only
-- ever run via the one-off script `scripts/migrate-membership-plans.mjs`,
-- never as a migration. As a result a fresh `supabase db reset` would fail
-- at 20260617_plan_tier_consolidation.sql (which ALTERs this table).
--
-- This migration codifies exactly what that script created. It is dated
-- 20260616 so it runs BEFORE any migration that references the table
-- (the earliest real dependency is 20260617_plan_tier_consolidation.sql,
-- which adds `intro_quota` — deliberately NOT included here so the two
-- together reproduce the live 16-column shape).
--
-- Fully guarded (IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS): a no-op
-- on the live DB, reproducible on a clean build.
--
-- NB: seed rows (individual / business / corporate) are still owned by the
-- seed scripts — this migration is schema-only.
-- ============================================================

create table if not exists public.membership_plans (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name                text not null,
  lede                text,
  contract_terms      text,
  annual_price_pence  integer not null default 0,
  monthly_price_pence integer not null default 0,
  features            text[] not null default '{}',
  image_url           text,
  tier_classification text,
  is_active           boolean not null default true,
  is_featured         boolean not null default false,
  display_order       integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.tg_membership_plans_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_membership_plans_updated_at on public.membership_plans;
create trigger trg_membership_plans_updated_at
  before update on public.membership_plans
  for each row
  execute function public.tg_membership_plans_set_updated_at();

-- RLS: public reads active plans; admins manage everything.
alter table public.membership_plans enable row level security;

drop policy if exists "Public read active plans" on public.membership_plans;
create policy "Public read active plans"
  on public.membership_plans
  for select
  using (is_active = true);

drop policy if exists "Admins manage plans" on public.membership_plans;
create policy "Admins manage plans"
  on public.membership_plans
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
