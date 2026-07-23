-- ============================================================
-- 20260723_accountability_foundation.sql
--   Team Accountability system — FOUNDATION only.
--
-- Two parts:
--   1. Staff login roles + staff record columns on profiles.
--   2. A brand-new, self-contained "Accountability" task module with a
--      full transparency layer (owner, deadline, status, comments,
--      attachments, outcome, and an append-only activity/history log).
--
-- The existing public.tasks module is NOT touched — this is a separate
-- surface with its own tables, RLS and storage bucket.
--
-- SECURITY MODEL
--   • Admins (is_admin()) can see & manage everything.
--   • A team_member / freelancer can see & act ONLY on accountability
--     tasks where they are the owner, plus the comments / attachments /
--     activity belonging to those tasks. They can touch NO other CRM
--     table (they only ever get RLS grants on the accountability_* tables
--     and the accountability-files storage bucket).
--
-- Fully guarded — safe to run twice.
--
-- NOTE on enum values: ALTER TYPE ... ADD VALUE runs here. On PG12+ this
-- is allowed inside a transaction as long as the new value is not USED in
-- the same transaction. Nothing below casts a literal to the new enum
-- values, so this migration is transaction-safe and idempotent.
-- ============================================================

-- ── 1. New login roles ───────────────────────────────────────
alter type public.user_role add value if not exists 'team_member';
alter type public.user_role add value if not exists 'freelancer';

-- ── 2. Staff record columns on profiles ──────────────────────
-- Team members ARE profiles (role = team_member | freelancer). job_title
-- already exists on profiles; we add a staff activation flag.
alter table public.profiles
  add column if not exists staff_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_staff_status_check;
alter table public.profiles add constraint profiles_staff_status_check
  check (staff_status in ('active', 'inactive'));

-- ── Helper: is the current user staff? ───────────────────────
-- Compares role against the new values. The literal→enum casts happen at
-- CALL time (not at CREATE time), so this is safe in the same migration.
create or replace function public.is_staff()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('team_member', 'freelancer')
  );
$$ language sql security definer stable;

-- ── 3a. accountability_tasks ─────────────────────────────────
create table if not exists public.accountability_tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  owner_id     uuid not null references public.profiles(id) on delete restrict,
  created_by   uuid references public.profiles(id) on delete set null,
  deadline     timestamptz,
  status       text not null default 'not_started',   -- not_started | in_progress | blocked | done
  outcome      text,                                   -- filled when closed
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.accountability_tasks drop constraint if exists accountability_tasks_status_check;
alter table public.accountability_tasks add constraint accountability_tasks_status_check
  check (status in ('not_started', 'in_progress', 'blocked', 'done'));

create index if not exists idx_acc_tasks_owner  on public.accountability_tasks(owner_id);
create index if not exists idx_acc_tasks_status on public.accountability_tasks(status);
create index if not exists idx_acc_tasks_deadline on public.accountability_tasks(deadline);

drop trigger if exists set_updated_at on public.accountability_tasks;
create trigger set_updated_at before update on public.accountability_tasks
  for each row execute function public.handle_updated_at();

-- ── 3b. accountability_task_comments ─────────────────────────
create table if not exists public.accountability_task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.accountability_tasks(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_acc_comments_task on public.accountability_task_comments(task_id);

-- ── 3c. accountability_task_attachments ──────────────────────
create table if not exists public.accountability_task_attachments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.accountability_tasks(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_path   text not null,   -- path inside the accountability-files bucket
  file_name   text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_acc_attachments_task on public.accountability_task_attachments(task_id);

-- ── 3d. accountability_task_activity (append-only history) ───
create table if not exists public.accountability_task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.accountability_tasks(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  event_type text not null,    -- created | status_changed | reassigned | outcome_recorded | comment_added | attachment_added
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_acc_activity_task on public.accountability_task_activity(task_id);

-- ── Activity logging via SECURITY DEFINER triggers ───────────
-- The history log is written by triggers (not the app) so it is robust and
-- cannot be skipped. SECURITY DEFINER lets the trigger insert into the
-- activity table regardless of the caller's RLS grants; there is therefore
-- NO direct INSERT policy on the activity table (append-only, system-owned).
-- actor_id = auth.uid() captures whoever performed the action.

create or replace function public.tg_acc_task_activity()
returns trigger security definer language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.accountability_task_activity (task_id, actor_id, event_type, detail)
    values (new.id, auth.uid(), 'created',
            jsonb_build_object('owner_id', new.owner_id, 'status', new.status));
    return new;
  end if;

  -- UPDATE
  if (new.status is distinct from old.status) then
    insert into public.accountability_task_activity (task_id, actor_id, event_type, detail)
    values (new.id, auth.uid(), 'status_changed',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if (new.owner_id is distinct from old.owner_id) then
    insert into public.accountability_task_activity (task_id, actor_id, event_type, detail)
    values (new.id, auth.uid(), 'reassigned',
            jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
  end if;

  if (new.outcome is distinct from old.outcome and new.outcome is not null) then
    insert into public.accountability_task_activity (task_id, actor_id, event_type, detail)
    values (new.id, auth.uid(), 'outcome_recorded', '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_acc_task_activity_ins on public.accountability_tasks;
create trigger trg_acc_task_activity_ins
  after insert on public.accountability_tasks
  for each row execute function public.tg_acc_task_activity();

drop trigger if exists trg_acc_task_activity_upd on public.accountability_tasks;
create trigger trg_acc_task_activity_upd
  after update on public.accountability_tasks
  for each row execute function public.tg_acc_task_activity();

create or replace function public.tg_acc_comment_activity()
returns trigger security definer language plpgsql as $$
begin
  insert into public.accountability_task_activity (task_id, actor_id, event_type, detail)
  values (new.task_id, auth.uid(), 'comment_added',
          jsonb_build_object('comment_id', new.id));
  return new;
end;
$$;

drop trigger if exists trg_acc_comment_activity on public.accountability_task_comments;
create trigger trg_acc_comment_activity
  after insert on public.accountability_task_comments
  for each row execute function public.tg_acc_comment_activity();

create or replace function public.tg_acc_attachment_activity()
returns trigger security definer language plpgsql as $$
begin
  insert into public.accountability_task_activity (task_id, actor_id, event_type, detail)
  values (new.task_id, auth.uid(), 'attachment_added',
          jsonb_build_object('file_name', new.file_name));
  return new;
end;
$$;

drop trigger if exists trg_acc_attachment_activity on public.accountability_task_attachments;
create trigger trg_acc_attachment_activity
  after insert on public.accountability_task_attachments
  for each row execute function public.tg_acc_attachment_activity();

-- ── 4. RLS ───────────────────────────────────────────────────
alter table public.accountability_tasks            enable row level security;
alter table public.accountability_task_comments    enable row level security;
alter table public.accountability_task_attachments enable row level security;
alter table public.accountability_task_activity     enable row level security;

-- accountability_tasks -------------------------------------------------
drop policy if exists "Admins manage accountability_tasks" on public.accountability_tasks;
create policy "Admins manage accountability_tasks"
  on public.accountability_tasks for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Owners read own accountability_tasks" on public.accountability_tasks;
create policy "Owners read own accountability_tasks"
  on public.accountability_tasks for select
  using (owner_id = auth.uid());

-- Owners may update their own task (status / outcome). The WITH CHECK keeps
-- them as the owner so they cannot reassign a task away from themselves.
drop policy if exists "Owners update own accountability_tasks" on public.accountability_tasks;
create policy "Owners update own accountability_tasks"
  on public.accountability_tasks for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
-- (No INSERT/DELETE policy for owners — only admins create/assign/delete.)

-- accountability_task_comments ----------------------------------------
drop policy if exists "Admins manage accountability_task_comments" on public.accountability_task_comments;
create policy "Admins manage accountability_task_comments"
  on public.accountability_task_comments for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Owners read comments on own tasks" on public.accountability_task_comments;
create policy "Owners read comments on own tasks"
  on public.accountability_task_comments for select
  using (exists (
    select 1 from public.accountability_tasks t
    where t.id = task_id and t.owner_id = auth.uid()
  ));

drop policy if exists "Owners add comments on own tasks" on public.accountability_task_comments;
create policy "Owners add comments on own tasks"
  on public.accountability_task_comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

-- accountability_task_attachments -------------------------------------
drop policy if exists "Admins manage accountability_task_attachments" on public.accountability_task_attachments;
create policy "Admins manage accountability_task_attachments"
  on public.accountability_task_attachments for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Owners read attachments on own tasks" on public.accountability_task_attachments;
create policy "Owners read attachments on own tasks"
  on public.accountability_task_attachments for select
  using (exists (
    select 1 from public.accountability_tasks t
    where t.id = task_id and t.owner_id = auth.uid()
  ));

drop policy if exists "Owners add attachments on own tasks" on public.accountability_task_attachments;
create policy "Owners add attachments on own tasks"
  on public.accountability_task_attachments for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners delete own attachments on own tasks" on public.accountability_task_attachments;
create policy "Owners delete own attachments on own tasks"
  on public.accountability_task_attachments for delete
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.accountability_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

-- accountability_task_activity (read-only for everyone; written by triggers)
drop policy if exists "Admins read accountability_task_activity" on public.accountability_task_activity;
create policy "Admins read accountability_task_activity"
  on public.accountability_task_activity for select
  using (public.is_admin());

drop policy if exists "Owners read activity on own tasks" on public.accountability_task_activity;
create policy "Owners read activity on own tasks"
  on public.accountability_task_activity for select
  using (exists (
    select 1 from public.accountability_tasks t
    where t.id = task_id and t.owner_id = auth.uid()
  ));

-- ── 5. Storage bucket for attachments ────────────────────────
-- Private bucket. Files are keyed as "<task_id>/<uuid>-<filename>".
insert into storage.buckets (id, name, public)
values ('accountability-files', 'accountability-files', false)
on conflict (id) do nothing;

-- Helper: can the current user access an object in the bucket? The first
-- path segment is the owning task id. Bad/absent uuids return false rather
-- than erroring.
create or replace function public.can_access_accountability_object(object_name text)
returns boolean as $$
declare
  tid uuid;
begin
  begin
    tid := split_part(object_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from public.accountability_tasks t
    where t.id = tid
      and (public.is_admin() or t.owner_id = auth.uid())
  );
end;
$$ language plpgsql security definer stable;

drop policy if exists "Access accountability files (select)" on storage.objects;
create policy "Access accountability files (select)"
  on storage.objects for select
  using (bucket_id = 'accountability-files'
         and public.can_access_accountability_object(name));

drop policy if exists "Access accountability files (insert)" on storage.objects;
create policy "Access accountability files (insert)"
  on storage.objects for insert
  with check (bucket_id = 'accountability-files'
              and public.can_access_accountability_object(name));

drop policy if exists "Access accountability files (delete)" on storage.objects;
create policy "Access accountability files (delete)"
  on storage.objects for delete
  using (bucket_id = 'accountability-files'
         and public.can_access_accountability_object(name));
