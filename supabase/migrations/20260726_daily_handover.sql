-- ============================================================
-- 20260726_daily_handover.sql
--   Daily Handover — Module 4 of the Team Accountability system.
--   Builds ON the Foundation (staff roles, is_admin(), profiles).
--
--   • Every staff member (team_member + freelancer) submits a short
--     END-OF-DAY handover through a form inside the CRM. Four fields:
--       - completed_today   → "What I completed today"
--       - working_tomorrow  → "What I'm working on tomorrow"
--       - blocked           → "What's blocked"
--       - support_needed    → "Support needed"
--   • One handover per staff per day (UNIQUE staff_id + handover_date),
--     editable that day (staff UPDATE their own).
--   • An admin can generate "Sarah's Daily Leadership Report" for a chosen
--     date: OpenAI condenses that day's handovers into one narrative
--     (templated fallback if OpenAI is unavailable), saved to daily_reports.
--
-- SECURITY MODEL (daily_handovers)
--   • Admins manage all (create/read/update/delete).
--   • A staff member may SELECT / INSERT / UPDATE only their OWN handover
--     (staff_id = auth.uid()). No staff DELETE. Staff cannot read others'
--     handovers (there is no policy that exposes other rows to non-admins).
--
-- SECURITY MODEL (daily_reports)
--   • Admin-only (staff have NO access — no staff policy at all). The
--     leadership report aggregates everyone's handovers, so it is never
--     exposed to staff.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── 1. daily_handovers ───────────────────────────────────────
create table if not exists public.daily_handovers (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.profiles(id) on delete cascade,
  handover_date   date not null,
  completed_today text,
  working_tomorrow text,
  blocked         text,
  support_needed  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One handover per staff per day (upsert target for the staff form).
drop index if exists public.uniq_daily_handover_staff_date;
create unique index uniq_daily_handover_staff_date
  on public.daily_handovers(staff_id, handover_date);

create index if not exists idx_daily_handovers_date
  on public.daily_handovers(handover_date);

drop trigger if exists set_updated_at on public.daily_handovers;
create trigger set_updated_at before update on public.daily_handovers
  for each row execute function public.handle_updated_at();

alter table public.daily_handovers enable row level security;

drop policy if exists "Admins manage daily_handovers" on public.daily_handovers;
create policy "Admins manage daily_handovers"
  on public.daily_handovers for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Staff read own daily_handovers" on public.daily_handovers;
create policy "Staff read own daily_handovers"
  on public.daily_handovers for select
  using (staff_id = auth.uid());

drop policy if exists "Staff insert own daily_handovers" on public.daily_handovers;
create policy "Staff insert own daily_handovers"
  on public.daily_handovers for insert
  with check (staff_id = auth.uid());

drop policy if exists "Staff update own daily_handovers" on public.daily_handovers;
create policy "Staff update own daily_handovers"
  on public.daily_handovers for update
  using (staff_id = auth.uid())
  with check (staff_id = auth.uid());
-- (No staff DELETE policy — staff cannot delete handovers.)

-- ── 2. daily_reports ─────────────────────────────────────────
create table if not exists public.daily_reports (
  id              uuid primary key default gen_random_uuid(),
  report_date     date not null,
  narrative       text,
  submitted_count int,
  staff_total     int,
  generated_at    timestamptz not null default now(),
  generated_by    uuid references public.profiles(id) on delete set null
);

-- One report per date (upsert on regenerate).
drop index if exists public.uniq_daily_report_date;
create unique index uniq_daily_report_date
  on public.daily_reports(report_date);

alter table public.daily_reports enable row level security;

-- Admin-only: no staff policy exists, so staff have no access at all.
drop policy if exists "Admins manage daily_reports" on public.daily_reports;
create policy "Admins manage daily_reports"
  on public.daily_reports for all
  using (public.is_admin()) with check (public.is_admin());
