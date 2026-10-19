-- Direct Debit through Stripe (UK Bacs Direct Debit) — additive only.
--
-- Decision: Direct Debit is collected by Stripe (payment method type
-- `bacs_debit`), NOT GoCardless. We deliberately do NOT add a value to the
-- public.payment_method enum: Stripe is still the processor, so payments keep
-- payment_method = 'stripe' and a new free-text column records which Stripe
-- method type was used. This avoids touching every consumer of the enum
-- (finance labels, ledger views, Xero sync) and the ALTER TYPE ... ADD VALUE
-- transaction caveats. The existing `gocardless` enum value and the
-- gocardless_* columns are left exactly as they are.
--
-- members.direct_debit_active (added in 20260608_member_profile_expansion)
-- is reused and kept in sync by the Stripe webhook: true only while the
-- Bacs mandate is active.
--
-- Idempotent: safe to run more than once.

-- ── members ─────────────────────────────────────────────────────────
alter table public.members
  add column if not exists stripe_payment_method_type text,
  add column if not exists stripe_mandate_id text,
  add column if not exists direct_debit_status text,
  add column if not exists direct_debit_reference text,
  add column if not exists direct_debit_updated_at timestamptz;

-- ── membership_applications ─────────────────────────────────────────
alter table public.membership_applications
  add column if not exists stripe_payment_method_type text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_mandate_id text,
  add column if not exists direct_debit_status text,
  add column if not exists direct_debit_reference text;

-- ── payments ────────────────────────────────────────────────────────
alter table public.payments
  add column if not exists stripe_payment_method_type text;

-- ── check constraints (added once) ──────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_stripe_payment_method_type_check'
  ) then
    alter table public.members
      add constraint members_stripe_payment_method_type_check
      check (stripe_payment_method_type is null or stripe_payment_method_type in ('card', 'bacs_debit'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'members_direct_debit_status_check'
  ) then
    alter table public.members
      add constraint members_direct_debit_status_check
      check (direct_debit_status is null or direct_debit_status in ('pending', 'active', 'failed', 'inactive'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'membership_applications_stripe_pm_type_check'
  ) then
    alter table public.membership_applications
      add constraint membership_applications_stripe_pm_type_check
      check (stripe_payment_method_type is null or stripe_payment_method_type in ('card', 'bacs_debit'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'membership_applications_dd_status_check'
  ) then
    alter table public.membership_applications
      add constraint membership_applications_dd_status_check
      check (direct_debit_status is null or direct_debit_status in ('pending', 'active', 'failed', 'inactive'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payments_stripe_payment_method_type_check'
  ) then
    alter table public.payments
      add constraint payments_stripe_payment_method_type_check
      check (stripe_payment_method_type is null or stripe_payment_method_type in ('card', 'bacs_debit'));
  end if;
end $$;

-- ── lookups used by the webhook (mandate.updated / customer match) ──
create index if not exists members_stripe_mandate_id_idx
  on public.members (stripe_mandate_id) where stripe_mandate_id is not null;
create index if not exists membership_applications_stripe_mandate_id_idx
  on public.membership_applications (stripe_mandate_id) where stripe_mandate_id is not null;

comment on column public.members.direct_debit_status is
  'Stripe Bacs Direct Debit mandate status: pending | active | failed | inactive. Set by the stripe-webhook edge function.';
comment on column public.payments.stripe_payment_method_type is
  'Stripe payment method type used (card | bacs_debit). payment_method stays ''stripe''.';
