-- ============================================================
-- 20260619_mailing_list_reconcile.sql
--
-- CATCH-UP MIGRATION — brings the migration folder in line with the
-- live database.
--
-- This is the one case of REVERSE drift: two columns exist in the
-- migrations but NOT on the live DB.
--
--   20260506_website_content.sql creates `mailing_list` with `subscribed`
--   (boolean) and `created_at` (timestamptz). On the live DB that CREATE
--   TABLE was a no-op (the table already existed), so those two columns
--   never landed. The subscribe/unsubscribe flows and the admin
--   SubscribersTab use `subscribed_at` / `unsubscribed_at` instead (added
--   in 20260617_schema_drift_catchup.sql), and nothing anywhere reads
--   `subscribed` or `created_at`.
--
-- A fresh `supabase db reset` WOULD create those two phantom columns,
-- diverging from live. This migration drops them so a clean build matches
-- the live schema exactly. It is a no-op on the live DB (the columns are
-- already absent).
--
-- ⚠️ If you would rather KEEP a created_at on mailing_list, do the opposite
-- instead: add it to live and delete this file. That's a product call —
-- this migration chooses "match live" as requested.
-- ============================================================

alter table public.mailing_list drop column if exists subscribed;
alter table public.mailing_list drop column if exists created_at;
