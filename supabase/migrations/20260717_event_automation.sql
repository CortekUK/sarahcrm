-- ============================================================
-- 20260717_event_automation.sql   (Feature #5 · Event automation)
--
-- Adds the state the event-automation machine needs:
--   • bookings.attendance      — records who actually turned up vs
--     no-showed (distinct from checked_in, which is the door toggle).
--   • bookings.checked_in_at    — timestamp of check-in (usually already
--     present; guarded add so this file is safe to re-run standalone).
--   • event_comms_sent          — one row per (booking, stage) the reminder
--     + post-event sequences send, so each stage fires EXACTLY once even
--     if the cron runs late or twice.
--
-- Admin-only CRM state. Fully guarded — safe to re-run.
-- ============================================================

-- ── bookings: attendance + check-in timestamp ────────────────
alter table public.bookings
  add column if not exists attendance text
    check (attendance in ('attended', 'no_show') or attendance is null);

alter table public.bookings
  add column if not exists checked_in_at timestamptz;

-- ── event_comms_sent — once-only ledger for event comms ──────
-- kind ∈ reminder_14d | reminder_7d | reminder_48h | reminder_morning
--        | thank_you | feedback | intro_recs | conversion
-- booking_id is null for event-level stages (e.g. intro_recs, which is
-- generated once per event rather than per attendee).
create table if not exists public.event_comms_sent (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  kind       text not null,
  sent_at    timestamptz not null default now()
);

-- Each per-attendee stage sends at most once. (Null booking_id rows —
-- event-level stages — are deduped by an explicit existence check in code,
-- since SQL treats nulls as distinct here.)
create unique index if not exists uniq_event_comms_booking_kind
  on public.event_comms_sent(booking_id, kind)
  where booking_id is not null;

create index if not exists idx_event_comms_event_kind
  on public.event_comms_sent(event_id, kind);

-- ── RLS — admin-only ─────────────────────────────────────────
alter table public.event_comms_sent enable row level security;

drop policy if exists "Admins manage event_comms_sent" on public.event_comms_sent;
create policy "Admins manage event_comms_sent"
  on public.event_comms_sent for all
  using (public.is_admin()) with check (public.is_admin());
