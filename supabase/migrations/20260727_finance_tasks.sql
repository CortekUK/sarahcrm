-- ============================================================
-- 20260727_finance_tasks.sql
--   Accountant Auto-Escalation — Module 6 of the Team Accountability system.
--   Builds ON the Foundation (is_admin(), profiles, handle_updated_at()).
--
--   Recurring finance tasks (Monthly Management Accounts, VAT Return,
--   Payroll, Cashflow Forecast, …). Each definition carries THREE assignable
--   contacts — name + email only (they need NOT be app users):
--       • accountant   (level 1)
--       • escalation   (Finance Director, level 2)
--       • final        (Sarah, level 3)
--   Every period produces one occurrence with a computed due_date. When an
--   occurrence goes overdue, the hourly automations cron emails each level in
--   turn — "the system chases, not Sarah." Escalation is guarded by
--   escalation_level so no level is ever emailed twice.
--
-- SECURITY MODEL (both tables)
--   • ADMIN-ONLY. This is finance data — staff/members have NO access.
--     There is no non-admin policy on either table.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── 1. finance_tasks (recurring definitions) ─────────────────
create table if not exists public.finance_tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  cadence           text not null check (cadence in ('monthly','quarterly','annual')),
  due_day           int  not null check (due_day between 1 and 28),
  accountant_name   text,
  accountant_email  text,
  escalation_name   text,
  escalation_email  text,
  final_name        text,
  final_email       text,
  active            boolean not null default true,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.finance_tasks;
create trigger set_updated_at before update on public.finance_tasks
  for each row execute function public.handle_updated_at();

alter table public.finance_tasks enable row level security;

-- Admin-only: no staff policy exists, so staff/members have no access at all.
drop policy if exists "Admins manage finance_tasks" on public.finance_tasks;
create policy "Admins manage finance_tasks"
  on public.finance_tasks for all
  using (public.is_admin()) with check (public.is_admin());

-- ── 2. finance_task_occurrences (one per period) ─────────────
create table if not exists public.finance_task_occurrences (
  id               uuid primary key default gen_random_uuid(),
  finance_task_id  uuid not null references public.finance_tasks(id) on delete cascade,
  period_label     text not null,               -- e.g. '2026-07' or '2026-Q3' or '2026'
  due_date         date not null,
  status           text not null default 'pending' check (status in ('pending','completed')),
  completed_at     timestamptz,
  completed_by     uuid references public.profiles(id) on delete set null,
  escalation_level int not null default 0,      -- 0=none 1=accountant 2=FD 3=final
  last_notified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One occurrence per (task, period) — the upsert target for the engine.
drop index if exists public.uniq_finance_occurrence_task_period;
create unique index uniq_finance_occurrence_task_period
  on public.finance_task_occurrences(finance_task_id, period_label);

create index if not exists idx_finance_occurrences_status_due
  on public.finance_task_occurrences(status, due_date);

drop trigger if exists set_updated_at on public.finance_task_occurrences;
create trigger set_updated_at before update on public.finance_task_occurrences
  for each row execute function public.handle_updated_at();

alter table public.finance_task_occurrences enable row level security;

-- Admin-only.
drop policy if exists "Admins manage finance_task_occurrences" on public.finance_task_occurrences;
create policy "Admins manage finance_task_occurrences"
  on public.finance_task_occurrences for all
  using (public.is_admin()) with check (public.is_admin());
