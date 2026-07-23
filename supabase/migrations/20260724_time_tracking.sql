-- ============================================================
-- 20260724_time_tracking.sql
--   Time Tracking module — builds ON the Team Accountability foundation.
--
--   • Staff (team_member / freelancer) log time against their OWN
--     accountability tasks — manual hours or a start/stop timer.
--   • A task can be linked to an Event; time rolls up Event → tasks →
--     entries. Staff therefore never touch the events table.
--   • Profitability (admin-only): manual event revenue − staff cost,
--     where cost = Σ(hours × that staff member's hourly rate).
--
-- SECURITY MODEL
--   • time_entries: a staff member may SELECT/INSERT/UPDATE/DELETE only
--     rows where staff_id = auth.uid() AND the referenced task is owned
--     by them (owner_id = auth.uid()). Admins manage all.
--   • event_profitability: admin-only. Staff have no access.
--   • staff_rates: admin-only. See NOTE below — this is why rates are NOT
--     stored on profiles.
--
-- NOTE — why rates live in their OWN table, not on profiles:
--   The existing profiles RLS includes
--       create policy "Authenticated users can view profiles"
--         on public.profiles for select using (true);
--   i.e. EVERY authenticated user (including staff) can read EVERY
--   profile row. Postgres RLS is row-level, not column-level, and admin
--   and staff share the same `authenticated` DB role, so a column on
--   profiles could NOT be hidden from staff. Storing hourly_rate on
--   profiles would therefore leak every staff member's rate to every
--   other staff member — exactly what the requirement forbids. A separate
--   admin-only table closes that leak completely (staff have zero grants
--   on it). Staff never need to read a rate: cost/profit is admin-only.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── 1. Link an accountability task to an Event ───────────────
-- Nullable; on delete set null so removing an event never destroys the
-- task or its logged time (time simply stops rolling up to that event).
alter table public.accountability_tasks
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists idx_acc_tasks_event on public.accountability_tasks(event_id);

-- ── 2. Per-staff hourly rate (admin-only) ────────────────────
create table if not exists public.staff_rates (
  staff_id    uuid primary key references public.profiles(id) on delete cascade,
  hourly_rate numeric(10,2),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.staff_rates enable row level security;

drop policy if exists "Admins manage staff_rates" on public.staff_rates;
create policy "Admins manage staff_rates"
  on public.staff_rates for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists set_updated_at on public.staff_rates;
create trigger set_updated_at before update on public.staff_rates
  for each row execute function public.handle_updated_at();

-- ── 3. time_entries ──────────────────────────────────────────
-- hours is NULL while a timer runs; filled (computed) on stop or entered
-- directly for a manual entry. started_at/ended_at only used by timers.
create table if not exists public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.profiles(id) on delete cascade,
  task_id    uuid not null references public.accountability_tasks(id) on delete cascade,
  hours      numeric(6,2),
  entry_date date not null default current_date,
  note       text,
  source     text not null default 'manual',   -- manual | timer
  started_at timestamptz,
  ended_at   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.time_entries drop constraint if exists time_entries_source_check;
alter table public.time_entries add constraint time_entries_source_check
  check (source in ('manual', 'timer'));

create index if not exists idx_time_entries_staff on public.time_entries(staff_id);
create index if not exists idx_time_entries_task  on public.time_entries(task_id);

-- At most ONE running timer per staff member. A running timer is a
-- source='timer' row whose ended_at is still null. Manual entries
-- (source='manual', ended_at null) are deliberately excluded so they
-- never collide with the running-timer slot.
drop index if exists public.uniq_running_timer_per_staff;
create unique index uniq_running_timer_per_staff
  on public.time_entries (staff_id)
  where (source = 'timer' and ended_at is null);

drop trigger if exists set_updated_at on public.time_entries;
create trigger set_updated_at before update on public.time_entries
  for each row execute function public.handle_updated_at();

alter table public.time_entries enable row level security;

-- Admins manage everything.
drop policy if exists "Admins manage time_entries" on public.time_entries;
create policy "Admins manage time_entries"
  on public.time_entries for all
  using (public.is_admin()) with check (public.is_admin());

-- Staff may read only their own entries (and only on tasks they own).
drop policy if exists "Staff read own time_entries" on public.time_entries;
create policy "Staff read own time_entries"
  on public.time_entries for select
  using (
    staff_id = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

-- Staff may log time only for themselves, only against their own tasks.
drop policy if exists "Staff insert own time_entries" on public.time_entries;
create policy "Staff insert own time_entries"
  on public.time_entries for insert
  with check (
    staff_id = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

-- Staff may amend/stop only their own entries on their own tasks; the
-- WITH CHECK keeps the row theirs (can't reassign it to someone else or
-- to a task they don't own).
drop policy if exists "Staff update own time_entries" on public.time_entries;
create policy "Staff update own time_entries"
  on public.time_entries for update
  using (
    staff_id = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  )
  with check (
    staff_id = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "Staff delete own time_entries" on public.time_entries;
create policy "Staff delete own time_entries"
  on public.time_entries for delete
  using (
    staff_id = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

-- ── 4. event_profitability (admin-only) ──────────────────────
-- Separate from the events table so we never touch existing event logic.
create table if not exists public.event_profitability (
  event_id   uuid primary key references public.events(id) on delete cascade,
  revenue    numeric(12,2) not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.event_profitability enable row level security;

drop policy if exists "Admins manage event_profitability" on public.event_profitability;
create policy "Admins manage event_profitability"
  on public.event_profitability for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists set_updated_at on public.event_profitability;
create trigger set_updated_at before update on public.event_profitability
  for each row execute function public.handle_updated_at();
