-- ============================================================
-- 20260704_tasks_module.sql   (Phase 1 · Feature #5)
--
-- Task Management module — sales, events and admin tasks with owner,
-- deadline, status and comments. The first layer of the
-- "if it isn't in the system, it doesn't exist" rule.
--
-- Two tables: tasks + task_comments. Admin-only (staff CRM tool).
-- Fully guarded — safe to re-run, safe against the existing schema.
-- ============================================================

-- ── tasks ────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  status            text not null default 'todo',      -- todo | in_progress | blocked | done
  priority          text not null default 'medium',    -- low | medium | high
  category          text not null default 'general',   -- sales | events | admin | general
  assigned_to       uuid references public.profiles(id) on delete set null,
  due_date          date,
  related_member_id uuid references public.members(id) on delete set null,
  related_event_id  uuid references public.events(id)  on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_tasks_status   on public.tasks(status);
create index if not exists idx_tasks_assigned on public.tasks(assigned_to);
create index if not exists idx_tasks_due       on public.tasks(due_date);

-- keep status/priority sane without being brittle
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'blocked', 'done'));
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check
  check (priority in ('low', 'medium', 'high'));

-- updated_at touch trigger (self-contained function for this module)
create or replace function public.tg_tasks_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.tg_tasks_touch();

-- ── task_comments ────────────────────────────────────────────
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_comments_task on public.task_comments(task_id);

-- ── RLS — admin-only on both ─────────────────────────────────
alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;

drop policy if exists "Admins manage tasks" on public.tasks;
create policy "Admins manage tasks"
  on public.tasks for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage task_comments" on public.task_comments;
create policy "Admins manage task_comments"
  on public.task_comments for all
  using (public.is_admin()) with check (public.is_admin());
