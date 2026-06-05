-- Pending-charge membership applications
-- ----------------------------------------------------------------------
-- New flow: the applicant's card is captured (saved, not charged) at
-- application time via a Stripe SetupIntent. The card is only charged
-- when an admin APPROVES the application (a subscription is created
-- against the saved payment method). On rejection nothing is charged and
-- the saved card is detached.
--
-- Several Stripe columns referenced by the existing checkout/sync/approve
-- /reject routes (stripe_customer_id, stripe_subscription_id, paid_at,
-- amount_paid_pence, refund_*) were added to the live database
-- out-of-band and never captured in a migration. We re-declare them here
-- with IF NOT EXISTS so the schema is finally reproducible, then add the
-- new columns the pending-charge flow needs.

alter table public.membership_applications
  -- Stripe linkage (re-declared, idempotent) ---------------------------
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists amount_paid_pence integer,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_id text,
  add column if not exists refund_amount_pence integer,
  -- Pending-charge additions -------------------------------------------
  -- The SetupIntent that captured (saved) the card at application time.
  add column if not exists stripe_setup_intent_id text,
  -- The saved card we charge on approval / detach on rejection.
  add column if not exists stripe_payment_method_id text,
  -- Gross amount (incl. VAT) quoted at application time, in pence. Locked
  -- here so approval charges exactly what the applicant agreed to, even
  -- if an admin later edits the plan price.
  add column if not exists quoted_amount_pence integer,
  -- Surfaced to the admin if the card declines at approval time.
  add column if not exists charge_error text,
  -- Set the first time we confirm a saved card, so re-running /confirm
  -- doesn't resend the "application received" email.
  add column if not exists pending_email_sent_at timestamptz;
