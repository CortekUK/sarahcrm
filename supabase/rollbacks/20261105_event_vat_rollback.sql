-- ROLLBACK for supabase/migrations/20261105_event_vat.sql
-- Only run AFTER the app code that reads events.vat_mode / vat_rate has been
-- reverted — the event pages select these columns and would error without
-- them. Kept outside supabase/migrations/ on purpose. Safe to run twice.

alter table public.events drop constraint if exists events_vat_mode_check;
alter table public.events drop constraint if exists events_vat_rate_check;
alter table public.events drop column if exists vat_mode;
alter table public.events drop column if exists vat_rate;
