-- ============================================================
-- 20260716_enquiry_routing.sql   (Phase 1 · Feature #1)
--
-- Lead scoring + enquiry routing. Turns a bare website enquiry into a
-- routed, scored, acknowledged CRM record with an auto-created sales
-- follow-up task. This migration only adds columns/indexes — it never
-- rewrites data and never weakens the existing RLS on enquiries
-- (public INSERT + admin/service-role ALL stay exactly as they are).
--
-- Columns were DERIVED from the intake route + admin view that consume
-- them (src/app/api/enquiries/intake/route.ts, EnquiriesListPage.tsx):
--   source           — where the enquiry came from (contact_form / concierge_form / …)
--   lead_score       — 0–100 deterministic score (src/lib/leads/scoring.ts)
--   score_reasons    — plain-English signals behind the score (jsonb string[])
--   assigned_to      — routed owner (a profiles row, resolved from app_settings)
--   acknowledged_at  — when the auto-acknowledgement email went out
--   related_task_id  — the sales follow-up task auto-created on intake
--
-- Fully guarded — safe to re-run, safe against the existing schema.
-- ============================================================

-- ── enquiries: routing + scoring + acknowledgement columns ───
alter table public.enquiries add column if not exists source text;
alter table public.enquiries add column if not exists lead_score integer;
alter table public.enquiries add column if not exists score_reasons jsonb;
alter table public.enquiries add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.enquiries add column if not exists acknowledged_at timestamptz;
alter table public.enquiries add column if not exists related_task_id uuid references public.tasks(id) on delete set null;

-- ── tasks: back-reference to the enquiry that spawned the task ───
alter table public.tasks add column if not exists related_enquiry_id uuid references public.enquiries(id) on delete set null;

-- ── Indexes for the admin owner/status filters ──────────────
create index if not exists idx_enquiries_assigned on public.enquiries(assigned_to);
create index if not exists idx_enquiries_status   on public.enquiries(status);

-- ── Routing rules live in app_settings (no new table) ────────
-- The intake route reads app_settings key 'enquiry_routing' to pick the
-- owner for a new enquiry by its first intent, falling back to the first
-- admin profile. The value is a jsonb object mapping intent -> profile uuid:
--
--   {
--     "membership":  "<profile_uuid>",
--     "event":       "<profile_uuid>",
--     "concierge":   "<profile_uuid>",
--     "sponsorship": "<profile_uuid>",
--     "venue":       "<profile_uuid>",
--     "general":     "<profile_uuid>"
--   }
--
-- Any missing/blank intent key falls through to the first admin. The row
-- is optional — with no row at all, every enquiry routes to the first admin.
-- (Seeded/edited from the admin Settings UI, not inserted here so we never
-- pin a hardcoded owner into a fresh environment.)
