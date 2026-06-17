-- Per-recipient introduction send/schedule
-- ----------------------------------------------------------------------
-- An introduction email can now be sent (or scheduled) to each member
-- INDEPENDENTLY — e.g. send to A now, schedule B for next week, or send to
-- one and not the other at all. These track each side's own state; the
-- existing scheduled_send_at/sent_at remain for backward-compat.
alter table public.introductions
  add column if not exists email_a_scheduled_at date,
  add column if not exists email_b_scheduled_at date,
  add column if not exists email_a_sent_at timestamptz,
  add column if not exists email_b_sent_at timestamptz;
