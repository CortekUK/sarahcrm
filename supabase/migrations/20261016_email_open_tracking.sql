-- ============================================================
-- 20261016_email_open_tracking.sql
--   Email OPEN/CLICK tracking on the unified email_log.
--
--   The Resend webhook (/api/webhooks/resend) already stamps opened_at /
--   clicked_at on `communications` (campaign sends), but `email_log` — where
--   every automation / transactional / sponsor-outreach send is recorded —
--   had no engagement columns, so opens on most mail were lost. This adds
--   them so the webhook can record the first open/click against the exact
--   sent email, and therefore against its member (email_log.member_id).
--
--   Used by the Member Success "Not opening emails" flag
--   (/api/admin/members/success), which derives each member's last open from
--   these columns + communications.opened_at (no per-member column needed).
--
--   NOTE: opens only arrive if open tracking is enabled on the Resend sending
--   domain (and clicks if click tracking is). Until then these stay null and
--   the flag stays silent by design.
--
-- Fully guarded — safe to run twice.
-- ============================================================

alter table public.email_log
  add column if not exists opened_at  timestamptz,
  add column if not exists clicked_at timestamptz;

-- Webhook match key (every event is matched on resend_message_id).
create index if not exists email_log_resend_message_idx
  on public.email_log (resend_message_id)
  where resend_message_id is not null;

-- Member Success lookups: one member's recent sends.
create index if not exists email_log_member_created_idx
  on public.email_log (member_id, created_at desc)
  where member_id is not null;
