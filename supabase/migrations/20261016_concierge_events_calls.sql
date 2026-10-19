-- ============================================================
-- 20261016_concierge_events_calls.sql
--   AI Website Concierge — call requests / call booking + in-app
--   admin notifications.
--
--   1. enquiries: call_* columns so the CRM can show
--      "Call requested: preferred …" (flag OFF) or the booked time
--      (flag ON) on an enquiry created by the concierge.
--   2. concierge_conversations: call_state (the per-conversation call
--      flow: team, preferences, slots offered, slot awaiting
--      confirmation, booking) + call_booked_at (per-IP booking cap).
--   3. admin_notifications: generic in-app notifications for admins
--      (no email). First writer: concierge call bookings.
--
-- SECURITY MODEL
--   • enquiries / concierge_conversations keep their existing RLS.
--   • admin_notifications is ADMIN-ONLY RLS (is_admin()). Server code
--     writes it with the service-role client (bypasses RLS).
--
-- The chat route tolerates this migration being absent: call_state is
-- read/written in separate best-effort queries, and the call request is
-- also written into the enquiry message + task title.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- 1. enquiries ───────────────────────────────────────────────
alter table public.enquiries add column if not exists call_requested_at  timestamptz;
alter table public.enquiries add column if not exists call_team          text;        -- sales | events | sarah
alter table public.enquiries add column if not exists call_preferences   text;        -- visitor's preferred days/times (free text)
alter table public.enquiries add column if not exists call_booked_start  timestamptz; -- set only when a slot was booked
alter table public.enquiries add column if not exists call_booked_end    timestamptz;
alter table public.enquiries add column if not exists call_calendar_event_id text;
alter table public.enquiries add column if not exists call_meet_url      text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'enquiries_call_team_check'
  ) then
    alter table public.enquiries
      add constraint enquiries_call_team_check
      check (call_team is null or call_team in ('sales', 'events', 'sarah'));
  end if;
end $$;

create index if not exists idx_enquiries_call_requested
  on public.enquiries(call_requested_at) where call_requested_at is not null;

-- 2. concierge_conversations ─────────────────────────────────
alter table public.concierge_conversations
  add column if not exists call_state jsonb not null default '{}'::jsonb;
alter table public.concierge_conversations
  add column if not exists call_booked_at timestamptz;

-- Supports the per-IP / day booking cap.
create index if not exists idx_concierge_conversations_ip_booked
  on public.concierge_conversations(ip, call_booked_at) where call_booked_at is not null;

-- 3. admin_notifications ─────────────────────────────────────
create table if not exists public.admin_notifications (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,                 -- e.g. 'concierge_call_booked'
  title               text not null,
  body                text,
  link                text,                          -- in-app path
  related_enquiry_id  uuid references public.enquiries(id) on delete set null,
  read_at             timestamptz,
  read_by             uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_admin_notifications_unread
  on public.admin_notifications(created_at desc) where read_at is null;
create index if not exists idx_admin_notifications_kind
  on public.admin_notifications(kind);

alter table public.admin_notifications enable row level security;

drop policy if exists "Admins manage admin_notifications" on public.admin_notifications;
create policy "Admins manage admin_notifications"
  on public.admin_notifications for all
  using (public.is_admin()) with check (public.is_admin());
