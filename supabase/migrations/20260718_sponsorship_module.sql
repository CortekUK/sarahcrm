-- ============================================================
-- 20260718_sponsorship_module.sql   (Feature #8 · Sponsorship module)
--
-- The sponsorship operating layer on top of the existing `sponsorships`
-- table:
--   • sponsor_deliverables   — the delivery checklist per sponsor (assets
--     required, branding deadlines, guest allocation, other), each with a
--     due date + status.
--   • sponsor_comms_sent     — once-only ledger for the staged follow-up
--     sequence (mirrors event_comms_sent / member_comms_sent), so each
--     stage fires EXACTLY once even if the cron runs late or twice.
--   • sponsorships            — three generated-document columns:
--     proposal_html (AI proposal), roi_report_html (post-event ROI report)
--     and roi_reach (headline reach figure stored alongside the report).
--
-- The per-sponsor public token already exists as `sponsorships.booking_token`
-- (used for the event booking link). The Sponsor Portal REUSES that token —
-- no new portal_token column is added. The portal is served by a server
-- component using the service-role client keyed by the token, so RLS is
-- NOT weakened for the public.
--
-- Admin-only CRM state. Fully guarded — safe to re-run.
-- ============================================================

-- ── sponsor_deliverables — the delivery checklist ────────────
create table if not exists public.sponsor_deliverables (
  id              uuid primary key default gen_random_uuid(),
  sponsorship_id  uuid not null references public.sponsorships(id) on delete cascade,
  label           text not null,
  category        text,      -- asset | branding | guest_allocation | other
  due_date        date,
  status          text not null default 'pending',   -- pending | received | done
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_sponsor_deliverables_sponsorship
  on public.sponsor_deliverables(sponsorship_id);

-- keep category/status sane without being brittle
alter table public.sponsor_deliverables drop constraint if exists sponsor_deliverables_category_check;
alter table public.sponsor_deliverables add constraint sponsor_deliverables_category_check
  check (category in ('asset', 'branding', 'guest_allocation', 'other') or category is null);
alter table public.sponsor_deliverables drop constraint if exists sponsor_deliverables_status_check;
alter table public.sponsor_deliverables add constraint sponsor_deliverables_status_check
  check (status in ('pending', 'received', 'done'));

-- updated_at touch trigger — reuse the shared function from the
-- initial schema (public.handle_updated_at()).
drop trigger if exists set_updated_at on public.sponsor_deliverables;
create trigger set_updated_at before update on public.sponsor_deliverables
  for each row execute function public.handle_updated_at();

-- ── sponsor_comms_sent — once-only follow-up ledger ──────────
-- kind ∈ followup_3d | followup_7d | followup_14d
create table if not exists public.sponsor_comms_sent (
  id              uuid primary key default gen_random_uuid(),
  sponsorship_id  uuid not null references public.sponsorships(id) on delete cascade,
  kind            text not null,
  sent_at         timestamptz not null default now()
);

-- Each stage sends at most once per sponsorship. The unique index is the
-- hard guarantee behind the code-level dedup.
create unique index if not exists uniq_sponsor_comms_sponsorship_kind
  on public.sponsor_comms_sent(sponsorship_id, kind);

-- ── sponsorships — generated-document columns ────────────────
alter table public.sponsorships
  add column if not exists proposal_html   text;
alter table public.sponsorships
  add column if not exists roi_report_html text;
alter table public.sponsorships
  add column if not exists roi_reach       integer;

-- ── RLS — admin-only on the new tables ───────────────────────
-- The Sponsor Portal does NOT read these via the browser: it is served by a
-- server component using the service-role client keyed by booking_token, so
-- we keep RLS strictly admin-only and never expose a public policy.
alter table public.sponsor_deliverables enable row level security;
alter table public.sponsor_comms_sent   enable row level security;

drop policy if exists "Admins manage sponsor_deliverables" on public.sponsor_deliverables;
create policy "Admins manage sponsor_deliverables"
  on public.sponsor_deliverables for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage sponsor_comms_sent" on public.sponsor_comms_sent;
create policy "Admins manage sponsor_comms_sent"
  on public.sponsor_comms_sent for all
  using (public.is_admin()) with check (public.is_admin());
