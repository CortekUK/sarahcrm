-- ============================================================
-- 20260708_rewards_benefits.sql   (Phase 2 · Rewards & Benefits)
--
-- The members' rewards/loyalty programme:
--   • reward_partners   — brands (hotels, restaurants, golf, watches…)
--   • reward_offers     — the perks each partner offers members
--   • reward_claims     — a member claiming/redeeming an offer (usage log)
--   • reward_referrals  — referral revenue + commission owed to a member
--   • members.member_number — a unique membership number per member
--
-- Additive & idempotent. Apple/Google Wallet passes and the external
-- theclubrewards / Raise Your Game integration are intentionally OUT of scope.
-- ============================================================

-- ── Member number (unique, auto-assigned) ───────────────────
create sequence if not exists public.member_number_seq start 1001;

alter table public.members add column if not exists member_number integer;

-- Backfill existing members in join order, no gaps (guarded: only nulls).
with ordered as (
  select id, 1000 + row_number() over (order by created_at, id) as n
  from public.members
  where member_number is null
)
update public.members m
set member_number = o.n
from ordered o
where m.id = o.id;

-- Advance the sequence past the highest assigned number.
select setval(
  'public.member_number_seq',
  greatest(1001, coalesce((select max(member_number) from public.members), 1000) + 1),
  false
);

-- New members get the next number automatically.
alter table public.members alter column member_number set default nextval('public.member_number_seq');
create unique index if not exists members_member_number_key on public.members(member_number);

-- ── reward_partners ─────────────────────────────────────────
create table if not exists public.reward_partners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null default 'Other',   -- Hotels | Restaurants | Golf | Travel | Luxury Retail | Property | Health & Wellness | Business Services | Automotive | Watches & Jewellery | Other
  description   text,
  logo_url      text,
  website_url   text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  is_active     boolean not null default true,
  is_public     boolean not null default true,   -- show on the public website
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_reward_partners_active on public.reward_partners(is_active);
create index if not exists idx_reward_partners_category on public.reward_partners(category);

-- ── reward_offers ───────────────────────────────────────────
create table if not exists public.reward_offers (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.reward_partners(id) on delete cascade,
  title              text not null,
  summary            text,          -- PUBLIC-safe teaser
  details            text,          -- member-only full details
  member_benefit     text,          -- the exclusive benefit line
  redemption_process text,          -- member-only how-to-redeem
  booking_url        text,
  discount_code      text,          -- member-only
  is_active          boolean not null default true,
  valid_until        date,
  display_order      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_reward_offers_partner on public.reward_offers(partner_id);
create index if not exists idx_reward_offers_active on public.reward_offers(is_active);

-- ── reward_claims (usage tracking) ──────────────────────────
create table if not exists public.reward_claims (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  offer_id    uuid not null references public.reward_offers(id) on delete cascade,
  status      text not null default 'claimed',   -- claimed | redeemed | cancelled
  claimed_at  timestamptz not null default now(),
  redeemed_at timestamptz,
  value_pence integer,                            -- optional revenue attributed
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.reward_claims drop constraint if exists reward_claims_status_check;
alter table public.reward_claims add constraint reward_claims_status_check
  check (status in ('claimed', 'redeemed', 'cancelled'));
create index if not exists idx_reward_claims_member on public.reward_claims(member_id);
create index if not exists idx_reward_claims_offer on public.reward_claims(offer_id);

-- ── reward_referrals (referral revenue + commission owed) ───
create table if not exists public.reward_referrals (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members(id) on delete cascade,  -- the referrer owed
  description     text,
  referred_name   text,
  revenue_pence   integer,    -- revenue The Club earned from the referral
  commission_pence integer,   -- amount owed to the member
  status          text not null default 'pending',   -- pending | paid
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.reward_referrals drop constraint if exists reward_referrals_status_check;
alter table public.reward_referrals add constraint reward_referrals_status_check
  check (status in ('pending', 'paid'));
create index if not exists idx_reward_referrals_member on public.reward_referrals(member_id);

-- ── updated_at touch triggers (shared function) ─────────────
create or replace function public.tg_rewards_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_reward_partners_touch on public.reward_partners;
create trigger trg_reward_partners_touch before update on public.reward_partners
  for each row execute function public.tg_rewards_touch();
drop trigger if exists trg_reward_offers_touch on public.reward_offers;
create trigger trg_reward_offers_touch before update on public.reward_offers
  for each row execute function public.tg_rewards_touch();
drop trigger if exists trg_reward_claims_touch on public.reward_claims;
create trigger trg_reward_claims_touch before update on public.reward_claims
  for each row execute function public.tg_rewards_touch();
drop trigger if exists trg_reward_referrals_touch on public.reward_referrals;
create trigger trg_reward_referrals_touch before update on public.reward_referrals
  for each row execute function public.tg_rewards_touch();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.reward_partners  enable row level security;
alter table public.reward_offers    enable row level security;
alter table public.reward_claims    enable row level security;
alter table public.reward_referrals enable row level security;

-- Partners: admin manage; anyone may read ACTIVE partners (marketing data;
-- the public site filters is_public, the portal shows all active).
drop policy if exists "Admins manage reward_partners" on public.reward_partners;
create policy "Admins manage reward_partners" on public.reward_partners
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Anyone reads active reward_partners" on public.reward_partners;
create policy "Anyone reads active reward_partners" on public.reward_partners
  for select using (is_active);

-- Offers: admin manage; only AUTHENTICATED users may read active offers
-- (offers carry member-only discount codes, so no anonymous access — the
-- public website fetches public offer fields server-side via service role).
drop policy if exists "Admins manage reward_offers" on public.reward_offers;
create policy "Admins manage reward_offers" on public.reward_offers
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Authed read active reward_offers" on public.reward_offers;
create policy "Authed read active reward_offers" on public.reward_offers
  for select to authenticated using (is_active);

-- Claims: admin manage; members create/read/update their OWN.
drop policy if exists "Admins manage reward_claims" on public.reward_claims;
create policy "Admins manage reward_claims" on public.reward_claims
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Members read own reward_claims" on public.reward_claims;
create policy "Members read own reward_claims" on public.reward_claims
  for select using (exists (select 1 from public.members
    where members.id = reward_claims.member_id and members.profile_id = auth.uid()));
drop policy if exists "Members create own reward_claims" on public.reward_claims;
create policy "Members create own reward_claims" on public.reward_claims
  for insert with check (exists (select 1 from public.members
    where members.id = reward_claims.member_id and members.profile_id = auth.uid()));
drop policy if exists "Members update own reward_claims" on public.reward_claims;
create policy "Members update own reward_claims" on public.reward_claims
  for update using (exists (select 1 from public.members
    where members.id = reward_claims.member_id and members.profile_id = auth.uid()));

-- Referrals: admin manage; members read their OWN (what they're owed).
drop policy if exists "Admins manage reward_referrals" on public.reward_referrals;
create policy "Admins manage reward_referrals" on public.reward_referrals
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Members read own reward_referrals" on public.reward_referrals;
create policy "Members read own reward_referrals" on public.reward_referrals
  for select using (exists (select 1 from public.members
    where members.id = reward_referrals.member_id and members.profile_id = auth.uid()));
