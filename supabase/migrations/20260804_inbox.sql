-- ============================================================
-- 20260804_inbox.sql
--   Unified Inbox — CHUNK 1 foundation.
--   Adds the data-driven mailbox-access model on top of the existing
--   `gmail_messages` sync (see 20260721_gmail_messages.sql) plus a couple of
--   supporting columns/tables for the Gmail-style reading experience.
--
-- ACCESS MODEL
--   • Admins see every configured inbox (enforced in the API via role, and via
--     is_admin() at the DB layer here).
--   • Every other user sees ONLY the inboxes explicitly granted to them through
--     `mailbox_access` rows. Extensible without a rebuild — grant/revoke a
--     mailbox by inserting/deleting a row.
--   • The inbox catalogue itself lives in app_settings (`gmail_sync_config`);
--     these tables only record per-user grants and read state.
--
-- NOTE
--   • gmail_messages RLS is NOT touched — it stays admin-only at the table.
--     The Inbox API reads via the service-role client and enforces per-user
--     mailbox access in code (next chunk).
--   • New tables are written by the untyped service-role client, so they are
--     intentionally absent from src/types/database.ts.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── mailbox_access ───────────────────────────────────────────
-- Per-user grant of a single mailbox (inbox email address).
create table if not exists public.mailbox_access (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  mailbox     text not null,                       -- inbox email, e.g. 'events@theclubbysarahrestrick.com'
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);

-- One grant per (profile, mailbox), case-insensitive on the mailbox address.
create unique index if not exists uq_mailbox_access
  on public.mailbox_access(profile_id, lower(mailbox));
create index if not exists idx_mailbox_access_profile
  on public.mailbox_access(profile_id);

alter table public.mailbox_access enable row level security;

drop policy if exists "Admins manage mailbox_access" on public.mailbox_access;
create policy "Admins manage mailbox_access"
  on public.mailbox_access for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users read own mailbox_access" on public.mailbox_access;
create policy "Users read own mailbox_access"
  on public.mailbox_access for select
  using (profile_id = auth.uid() or public.is_admin());

-- ── gmail_messages: full HTML body ───────────────────────────
-- Lazy-persisted full HTML for the reading pane. Existing columns/RLS untouched.
alter table public.gmail_messages add column if not exists body_html text;

-- ── inbox_read_state ─────────────────────────────────────────
-- Per-user read tracking, keyed by thread — drives the unread-bold styling.
create table if not exists public.inbox_read_state (
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  gmail_thread_id  text not null,
  mailbox          text,
  read_at          timestamptz not null default now(),
  primary key (profile_id, gmail_thread_id)
);

alter table public.inbox_read_state enable row level security;

drop policy if exists "Users manage own inbox_read_state" on public.inbox_read_state;
create policy "Users manage own inbox_read_state"
  on public.inbox_read_state for all
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
