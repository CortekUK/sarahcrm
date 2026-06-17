-- Make `payments` a complete revenue ledger, including guest event bookings.
--
-- Until now payments.member_id was NOT NULL, so guest (non-member) event
-- bookings never produced a payment row — their revenue lived only on
-- bookings.amount_pence and the Finance page had to stitch it back in from
-- the bookings table. That made `payments` an incomplete ledger.
--
-- This migration:
--   1. Drops the NOT NULL on payments.member_id so guest payments can be
--      recorded with a null member (RLS already keys member visibility on
--      members.id = payments.member_id, so a null-member row is simply
--      admin-only — no policy change needed).
--   2. Back-fills a paid `event_booking` payment row for every already
--      confirmed guest booking that doesn't yet have one, so historical
--      guest revenue is in the ledger too.

alter table public.payments alter column member_id drop not null;

comment on column public.payments.member_id is
  'Owning member. NULL for guest (non-member) payments such as guest event bookings; those rows are admin-only under RLS.';

insert into public.payments (
  member_id, amount_pence, currency, payment_type, payment_method,
  status, paid_at, reference_id, description
)
select
  null,
  coalesce(b.amount_pence, 0),
  'GBP',
  'event_booking',
  coalesce(b.payment_method, 'stripe'),
  'paid',
  b.created_at,
  b.id,
  'Event booking (guest)'
from public.bookings b
where b.is_guest = true
  and b.member_id is null
  and b.status = 'confirmed'
  and coalesce(b.amount_pence, 0) > 0
  and not exists (
    select 1 from public.payments p where p.reference_id = b.id
  );
