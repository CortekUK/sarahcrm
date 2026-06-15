-- Card-hold fields on bookings, so an event booking can save a card
-- (Stripe SetupIntent) WITHOUT charging when the event isn't auto-confirm,
-- then be charged on admin approval. Mirrors the membership pending-charge
-- flow. Guests have no member row, so the held card lives on the booking.
alter table public.bookings
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists charge_error text;
