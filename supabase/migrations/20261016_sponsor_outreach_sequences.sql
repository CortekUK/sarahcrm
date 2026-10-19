-- ============================================================
-- 20261016_sponsor_outreach_sequences.sql
--   Sponsorship Intelligence — scheduled follow-up SEQUENCES + reply tracking.
--   Builds ON 20260801_sponsorship_intelligence.sql (sponsor_prospects,
--   sponsor_outreach). Replaces the "Instantly later" plan with an in-CRM
--   sequence runner that still keeps the human gate.
--
--   sponsor_outreach gains:
--     • sequence_id        — groups the steps drafted together (one draft
--                            call = one sequence). Backfilled for old rows as
--                            one sequence per (prospect, decision-maker).
--     • delay_days         — days to wait AFTER THE PREVIOUS STEP WAS SENT
--                            before this step is due (step 0 = 0).
--     • due_at             — when this step becomes due. Null until the
--                            previous step has actually been sent.
--     • auto_send          — "approve and schedule": an approved step with
--                            auto_send=true is sent by the daily automation
--                            runner once due_at has passed. Status must STILL
--                            be 'approved' — the hard gate is unchanged.
--     • send_claimed_at    — short-lived claim so the cron and a manual Send
--                            can never send the same row twice.
--     • opened_at / clicked_at — first Resend open/click on the sent step.
--     • response_gmail_message_id — the synced Gmail message that was matched
--                            as the reply (traceability + idempotency).
--     • status 'cancelled' — remaining steps after a reply/bounce, or an
--                            admin stopping the sequence.
--
--   sponsor_prospects gains:
--     • replied_at — first detected reply from this prospect ("Replied" badge;
--                    also blocks any further automatic sends).
--
-- SECURITY: unchanged — both tables stay admin-only (is_admin()) and are
-- written by the service-role client. Not in src/types/database.ts (the
-- sponsor_* tables are intentionally untyped, see the original migration).
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── sponsor_outreach: sequence + tracking columns ───────────
alter table public.sponsor_outreach
  add column if not exists sequence_id               uuid,
  add column if not exists delay_days                int not null default 0,
  add column if not exists due_at                    timestamptz,
  add column if not exists auto_send                 boolean not null default false,
  add column if not exists send_claimed_at           timestamptz,
  add column if not exists opened_at                 timestamptz,
  add column if not exists clicked_at                timestamptz,
  add column if not exists response_gmail_message_id text;

-- delay_days can never be negative.
alter table public.sponsor_outreach
  drop constraint if exists sponsor_outreach_delay_days_check;
alter table public.sponsor_outreach
  add constraint sponsor_outreach_delay_days_check check (delay_days >= 0);

-- Status: add 'cancelled' to the original set.
alter table public.sponsor_outreach
  drop constraint if exists sponsor_outreach_status_check;
alter table public.sponsor_outreach
  add constraint sponsor_outreach_status_check
  check (status in ('draft','approved','scheduled','sent','failed','replied','bounced','cancelled'));

-- Backfill: rows drafted before this migration have no sequence_id. Treat all
-- steps for one (prospect, decision-maker) as one sequence. Deterministic, so
-- re-running produces the same ids; only touches rows still null.
update public.sponsor_outreach
   set sequence_id = md5(prospect_id::text || ':' || coalesce(decision_maker_id::text, ''))::uuid
 where sequence_id is null;

-- Runner lookup: approved + scheduled + due.
create index if not exists idx_sponsor_outreach_due
  on public.sponsor_outreach (due_at)
  where status = 'approved' and auto_send = true;
create index if not exists idx_sponsor_outreach_sequence
  on public.sponsor_outreach (sequence_id, step);
-- Resend webhook lookup (open/click/bounce by message id).
create index if not exists idx_sponsor_outreach_external
  on public.sponsor_outreach (external_id)
  where external_id is not null;

-- ── sponsor_prospects: replied flag ─────────────────────────
alter table public.sponsor_prospects
  add column if not exists replied_at timestamptz;
