-- Plan == Tier consolidation
--
-- Establishes the canonical model: there are exactly three membership
-- PLANS and each plan IS a tier. The plan (membership_tier) is the single
-- source of truth; membership_type and the monthly intro quota are derived
-- from it. This migration:
--   1. Moves the intro quota onto membership_plans (editable in admin).
--   2. Backfills every member's quota from their plan.
--   3. Forces membership_type to match the tier (tier_1 → individual,
--      tier_2/tier_3 → business).
--   4. Drops the legacy membership_tiers 3×2 matrix table.
--   5. Removes the orphaned 'partner' value from the membership_type enum.

-- 1. Intro quota lives on the plan now. -1 means unlimited.
alter table public.membership_plans
  add column if not exists intro_quota integer not null default 3;

-- 2. Seed the live per-plan quotas (each plan IS a tier).
update public.membership_plans set intro_quota = 3 where slug = 'individual';
update public.membership_plans set intro_quota = 5 where slug = 'business';
update public.membership_plans set intro_quota = 10 where slug = 'corporate';

-- 3. Backfill member quotas from their plan, matched on tier_classification.
update public.members m
set monthly_intro_quota = p.intro_quota
from public.membership_plans p
where p.tier_classification = m.membership_tier::text;

-- 4. Normalise membership_type so it always matches the tier (the plan).
update public.members
  set membership_type = 'individual'
  where membership_tier = 'tier_1' and membership_type <> 'individual';
update public.members
  set membership_type = 'business'
  where membership_tier in ('tier_2', 'tier_3') and membership_type <> 'business';

-- 5. Drop the legacy membership_tiers table (replaced by membership_plans).
drop table if exists public.membership_tiers;

-- 6. Remove the orphaned 'partner' value from membership_type. Postgres
--    can't drop an enum value in place, so recreate the type. Safe because
--    no rows use 'partner' and no views depend on the type.
do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'membership_type' and e.enumlabel = 'partner'
  ) then
    alter type public.membership_type rename to membership_type__old;
    create type public.membership_type as enum ('individual', 'business');
    alter table public.members alter column membership_type drop default;
    alter table public.members
      alter column membership_type type public.membership_type
      using membership_type::text::public.membership_type;
    alter table public.members alter column membership_type set default 'individual';
    drop type public.membership_type__old;
  end if;
end $$;
