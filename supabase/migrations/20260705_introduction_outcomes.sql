-- ============================================================
-- 20260705_introduction_outcomes.sql   (Phase 2 · Feature #2)
--
-- Introduction Outcome Tracking — turn the flat outcome fields
-- (outcome / business_converted / estimated_value_pence) into an
-- explicit commercial pipeline:
--
--   Introduced → Meeting held → Proposal sent → Deal won/lost
--   → Revenue generated → Testimonial
--
-- Purely ADDITIVE: new nullable columns only. The existing
-- intro_status enum, send flow and completion semantics
-- (status='completed' + followed_up_at) are left untouched.
-- Safe to re-run.
-- ============================================================

-- ── new pipeline columns ─────────────────────────────────────
alter table public.introductions
  add column if not exists meeting_held_at     timestamptz,
  add column if not exists proposal_sent_at    timestamptz,
  add column if not exists deal_status         text,          -- null = undecided | 'won' | 'lost'
  add column if not exists deal_closed_at      timestamptz,
  add column if not exists revenue_pence       integer,       -- realised revenue on a won deal
  add column if not exists testimonial_obtained boolean not null default false,
  add column if not exists testimonial_note    text;

-- keep deal_status sane (undecided stays NULL)
alter table public.introductions drop constraint if exists introductions_deal_status_check;
alter table public.introductions add constraint introductions_deal_status_check
  check (deal_status is null or deal_status in ('won', 'lost'));

-- ── backfill existing completed intros into the new pipeline ──
-- Historic completed rows have no deal_status yet. Derive it from
-- the legacy business_converted flag so they render correctly in the
-- new pipeline UI, and carry any recorded value across as realised
-- revenue for won deals. Guarded so re-runs are no-ops.
update public.introductions
set
  deal_status    = case when business_converted then 'won' else 'lost' end,
  deal_closed_at = coalesce(deal_closed_at, followed_up_at, updated_at),
  revenue_pence  = case
                     when business_converted then coalesce(revenue_pence, estimated_value_pence)
                     else revenue_pence
                   end
where status = 'completed'
  and deal_status is null;
