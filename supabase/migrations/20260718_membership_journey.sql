-- ============================================================
-- 20260718_membership_journey.sql   (Membership journey automation)
--
-- Adds the once-only ledger the membership-journey machine needs:
--   • member_comms_sent — one row per (member, stage) the welcome
--     journey + renewal cadence send, so each stage fires EXACTLY
--     once even if the cron runs late or twice.
--
-- Journey stages (kind):
--   welcome_day2 | welcome_day10 | welcome_day14
--   renewal_90d | renewal_60d | renewal_30d | renewal_7d
--   renewal_retention_task   (the non-auto-renew retention branch)
--
-- Admin-only CRM state. Fully guarded — safe to re-run.
-- ============================================================

-- ── member_comms_sent — once-only ledger for member comms ────
create table if not exists public.member_comms_sent (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  kind       text not null,
  sent_at    timestamptz not null default now()
);

-- Each journey / renewal stage sends at most once per member.
create unique index if not exists uniq_member_comms_member_kind
  on public.member_comms_sent(member_id, kind);

-- ── RLS — admin-only ─────────────────────────────────────────
alter table public.member_comms_sent enable row level security;

drop policy if exists "Admins manage member_comms_sent" on public.member_comms_sent;
create policy "Admins manage member_comms_sent"
  on public.member_comms_sent for all
  using (public.is_admin()) with check (public.is_admin());
