-- ============================================================
-- 20260619_payments_checkout_session.sql
--
-- CATCH-UP MIGRATION — brings the migration folder in line with the
-- live database.
--
-- `payments.stripe_checkout_session_id` exists on the live DB and is
-- written by the `stripe-webhook` edge function
-- (supabase/functions/stripe-webhook/index.ts), but no migration ever
-- added it. This codifies it.
--
-- Fully guarded — a no-op on the live DB.
-- ============================================================

alter table public.payments
  add column if not exists stripe_checkout_session_id text;
