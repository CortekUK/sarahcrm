-- Interactive introductions + global send-time settings
-- ----------------------------------------------------------------------
-- Turns introductions from a read-only, concierge-tracked record into a
-- two-sided accept/reject flow, and adds date-scheduling for the intro
-- email. Also introduces a small singleton settings store so the daily
-- automation send-hour (UK) is editable from the admin Settings page.
--
-- Flow recap (overall `status`):
--   approved          -> Sarah approved a match (intro row created)
--   scheduled / sent  -> emails queued for a date / already sent
--   accepted          -> BOTH parties accepted  ("ready to connect")
--   declined          -> EITHER party declined
--
-- Per-party state lives in member_a_response / member_b_response so we can
-- show "Ghulam: accepted, Abubakar: pending". The *_response_note fields
-- are Sarah-only (never surfaced to the other member — enforced in the
-- app layer: portal reads omit them; only admin / service-role reads them).

-- ── Enums ─────────────────────────────────────────────────────────────
-- New value on the existing lifecycle enum. ADD VALUE cannot share a
-- transaction with statements that USE the value, so it sits up top and
-- is safe to re-run.
alter type public.intro_status add value if not exists 'scheduled';

-- Per-party response enum.
do $$ begin
  create type public.intro_response as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null; end $$;

-- ── introductions: per-party responses, notes, schedule, email drafts ──
alter table public.introductions
  add column if not exists member_a_response public.intro_response not null default 'pending',
  add column if not exists member_b_response public.intro_response not null default 'pending',
  add column if not exists member_a_response_note text,
  add column if not exists member_b_response_note text,
  add column if not exists member_a_responded_at timestamptz,
  add column if not exists member_b_responded_at timestamptz,
  -- Date Sarah scheduled the email for (NULL = send immediately / already sent).
  add column if not exists scheduled_send_at date,
  -- The exact (editable) email content Sarah composed, persisted so a
  -- scheduled send fires precisely what she wrote.
  add column if not exists email_a_subject text,
  add column if not exists email_a_body text,
  add column if not exists email_b_subject text,
  add column if not exists email_b_body text;

create index if not exists introductions_scheduled_send_at_idx
  on public.introductions (scheduled_send_at)
  where scheduled_send_at is not null;

-- ── app_settings: tiny admin-managed key/value singleton store ─────────
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

do $$ begin
  create policy "Admins manage app_settings"
    on public.app_settings for all
    using (public.is_admin())
    with check (public.is_admin());
exception when duplicate_object then null; end $$;

drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at before update on public.app_settings
  for each row execute function public.handle_updated_at();

-- Default daily automation send-hour: 07:00 Europe/London.
insert into public.app_settings (key, value)
values ('daily_send_hour', '7'::jsonb)
on conflict (key) do nothing;
