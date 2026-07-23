-- ============================================================
-- 20260725_weekly_scorecards.sql
--   Weekly Scorecards — builds ON the Team Accountability foundation
--   and the Time Tracking module.
--
--   • An admin sets each staff member's weekly targets: a label + a
--     target number, each with a SOURCE:
--       - manual          → actual is entered by hand (staff self-report,
--                            stored in manual_actual; admins may edit too).
--       - tasks_completed → actual auto = count of that staff member's
--                            accountability_tasks with status='done' whose
--                            updated_at (completion) falls in the week.
--       - hours_logged    → actual auto = sum of that staff member's
--                            time_entries.hours with entry_date in the week.
--   • Weeks run Monday→Sunday, identified by week_start (a Monday date).
--   • A Friday summary rolls up targets Met / Total, a performance score
--     (0–100 = % of targets met) and a short AI narrative.
--
-- SECURITY MODEL (scorecard_targets)
--   • Admins manage all (create/read/update/delete).
--   • A staff member may SELECT only their own targets (staff_id = uid).
--   • A staff member may UPDATE only their own source='manual' targets, and
--     only the manual_actual column — they must NOT create/delete targets or
--     change label / target_value / source / staff_id / week_start.
--       - The UPDATE policy restricts WHICH rows (own + manual).
--       - A BEFORE UPDATE trigger enforces WHICH COLUMNS: for a non-admin it
--         forces every protected column back to its OLD value, so only
--         manual_actual (and updated_at) can actually change. This is the
--         column-level guarantee Postgres RLS policies alone cannot give
--         (a WITH CHECK clause cannot see OLD values), and admin + staff
--         share the same `authenticated` DB role so per-column GRANTs cannot
--         separate them either.
--   • Target creation is therefore admin-only (no staff INSERT/DELETE policy).
--
-- SECURITY MODEL (scorecard_summaries)
--   • Admins manage all. A staff member may SELECT only their own summary.
--     Staff never write summaries (generation is an admin action).
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── 1. scorecard_targets ─────────────────────────────────────
create table if not exists public.scorecard_targets (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  week_start    date not null,
  label         text not null,
  target_value  numeric not null default 0,
  source        text not null default 'manual',
  manual_actual numeric not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.scorecard_targets drop constraint if exists scorecard_targets_source_check;
alter table public.scorecard_targets add constraint scorecard_targets_source_check
  check (source in ('manual', 'tasks_completed', 'hours_logged'));

create index if not exists idx_scorecard_targets_staff_week
  on public.scorecard_targets(staff_id, week_start);

drop trigger if exists set_updated_at on public.scorecard_targets;
create trigger set_updated_at before update on public.scorecard_targets
  for each row execute function public.handle_updated_at();

-- Column-level guard for non-admin updates (see SECURITY MODEL above).
create or replace function public.scorecard_targets_guard_columns()
returns trigger
language plpgsql
as $$
begin
  -- Admins may change anything.
  if public.is_admin() then
    return new;
  end if;
  -- Non-admins (staff) may only ever touch manual_actual on a manual target.
  -- Force every other column back to its stored value so nothing else can
  -- change even if a policy WITH CHECK would have allowed the row through.
  new.id           := old.id;
  new.staff_id     := old.staff_id;
  new.week_start   := old.week_start;
  new.label        := old.label;
  new.target_value := old.target_value;
  new.source       := old.source;
  new.created_by   := old.created_by;
  new.created_at   := old.created_at;
  -- manual_actual only makes sense for manual targets.
  if old.source <> 'manual' then
    new.manual_actual := old.manual_actual;
  end if;
  return new;
end;
$$;

drop trigger if exists scorecard_targets_guard on public.scorecard_targets;
create trigger scorecard_targets_guard before update on public.scorecard_targets
  for each row execute function public.scorecard_targets_guard_columns();

alter table public.scorecard_targets enable row level security;

drop policy if exists "Admins manage scorecard_targets" on public.scorecard_targets;
create policy "Admins manage scorecard_targets"
  on public.scorecard_targets for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Staff read own scorecard_targets" on public.scorecard_targets;
create policy "Staff read own scorecard_targets"
  on public.scorecard_targets for select
  using (staff_id = auth.uid());

-- Staff may UPDATE only their own manual targets. The column guard trigger
-- ensures only manual_actual is actually mutated.
drop policy if exists "Staff update own manual scorecard_actuals" on public.scorecard_targets;
create policy "Staff update own manual scorecard_actuals"
  on public.scorecard_targets for update
  using (staff_id = auth.uid() and source = 'manual')
  with check (staff_id = auth.uid() and source = 'manual');

-- ── 2. scorecard_summaries ───────────────────────────────────
create table if not exists public.scorecard_summaries (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references public.profiles(id) on delete cascade,
  week_start        date not null,
  performance_score numeric,
  targets_met       int,
  targets_total     int,
  narrative         text,
  generated_at      timestamptz not null default now(),
  generated_by      uuid references public.profiles(id) on delete set null
);

drop index if exists public.uniq_scorecard_summary_staff_week;
create unique index uniq_scorecard_summary_staff_week
  on public.scorecard_summaries(staff_id, week_start);

alter table public.scorecard_summaries enable row level security;

drop policy if exists "Admins manage scorecard_summaries" on public.scorecard_summaries;
create policy "Admins manage scorecard_summaries"
  on public.scorecard_summaries for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Staff read own scorecard_summaries" on public.scorecard_summaries;
create policy "Staff read own scorecard_summaries"
  on public.scorecard_summaries for select
  using (staff_id = auth.uid());
