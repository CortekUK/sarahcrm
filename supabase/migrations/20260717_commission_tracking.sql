-- ============================================================
-- 20260717_commission_tracking.sql   (Feature #3 · Commission tracker)
--
-- Unifies the three commission silos behind one read-mostly tracker
-- (src/views/admin/commissions/CommissionsPage.tsx). Each silo keeps
-- its own origin editor as the write surface; this migration only adds
-- the columns the tracker needs to follow a commission end-to-end
-- (owed → paid) and to auto-suggest introduced-business commission.
--
-- Commissions have a DIRECTION — this migration does NOT merge them:
--   • Receivable (Club EARNS): introductions + concierge_requests.
--   • Payable  (Club OWES a member): reward_referrals (unchanged here;
--     it already carries commission_pence + status pending|paid).
--
-- All statements are guarded — safe to re-run. No new RLS: these tables
-- already carry admin RLS via public.is_admin().
-- ============================================================

-- ── introductions — introduced-business commission (Receivable) ──
-- revenue_pence already tracks the deal value; these add the Club's
-- commission on that introduced business and its owed→paid lifecycle.
alter table public.introductions
  add column if not exists commission_pence integer;

alter table public.introductions
  add column if not exists commission_status text not null default 'pending';

alter table public.introductions
  add column if not exists commission_paid_at timestamptz;

-- Constrain the status to the tracked lifecycle. Dropped-then-created
-- so re-runs converge on the same definition.
alter table public.introductions
  drop constraint if exists introductions_commission_status_check;
alter table public.introductions
  add constraint introductions_commission_status_check
  check (commission_status in ('pending', 'paid'));

-- ── concierge_requests — paid-flag for existing commission_pence ──
-- commission_pence already exists (the Club's concierge commission —
-- Receivable). The `status` column is the fulfilment pipeline and must
-- NOT be overloaded, so the tracker marks commission paid via its own
-- dedicated flag here.
alter table public.concierge_requests
  add column if not exists commission_status text not null default 'pending';

alter table public.concierge_requests
  add column if not exists commission_paid_at timestamptz;

alter table public.concierge_requests
  drop constraint if exists concierge_requests_commission_status_check;
alter table public.concierge_requests
  add constraint concierge_requests_commission_status_check
  check (commission_status in ('pending', 'paid'));

-- ── members — per-member introducer-agreement rate ───────────────
-- Optional percentage from a member's introducer agreement. When set,
-- the intro outcome editor pre-fills commission = revenue × pct as an
-- editable suggestion on won deals. Stored as a plain percentage
-- (e.g. 10 = 10%).
alter table public.members
  add column if not exists agreement_commission_pct numeric;
