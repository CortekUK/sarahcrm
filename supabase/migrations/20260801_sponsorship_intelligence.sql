-- ============================================================
-- 20260801_sponsorship_intelligence.sql
--   Sponsorship Intelligence & AI Sales Assistant — CHUNK 1 foundation.
--   Builds ON the Foundation (is_admin(), profiles, events, sponsorships,
--   handle_updated_at()).
--
--   Three tables that hold the sponsorship-prospecting pipeline:
--     • sponsor_prospects       — candidate sponsor companies per event, with
--                                 AI match scoring and a status funnel.
--     • sponsor_decision_makers — enriched people (from a vendor) per prospect.
--     • sponsor_outreach        — draft/approved/sent outreach messages, sent
--                                 through the outreach sender seam (Resend today,
--                                 Instantly later).
--
-- SECURITY MODEL
--   • ADMIN-ONLY. Every table is `for all using is_admin() with check is_admin()`.
--     No staff / member / anon policy exists → no access for anyone else.
--   • These tables are written by the untyped service-role client later, so they
--     are intentionally absent from src/types/database.ts.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── sponsor_prospects ────────────────────────────────────────
create table if not exists public.sponsor_prospects (
  id                        uuid primary key default gen_random_uuid(),
  event_id                  uuid not null references public.events on delete cascade,
  company_name              text not null,
  company_domain            text,
  website_url               text,
  linkedin_url              text,
  industry                  text,
  employee_count            int,
  revenue_printed           text,
  description               text,
  source                    text not null default 'cold'
                              check (source in ('past_sponsor','crm_member','crm_contact','warm_lead','cold')),
  temperature               text not null default 'cold'
                              check (temperature in ('warm','cold')),
  source_ref_id             uuid,
  vendor                    text,
  vendor_raw                jsonb,
  match_score               int,
  match_reasons             jsonb not null default '[]'::jsonb,
  ai_rationale              text,
  status                    text not null default 'suggested'
                              check (status in ('suggested','shortlisted','approved','contacted','responded','won','lost','dismissed')),
  converted_sponsorship_id  uuid references public.sponsorships on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_sponsor_prospects_event   on public.sponsor_prospects(event_id);
create index if not exists idx_sponsor_prospects_status  on public.sponsor_prospects(status);
create index if not exists idx_sponsor_prospects_domain  on public.sponsor_prospects(company_domain);
-- One prospect per company (by domain, case-insensitive) per event.
create unique index if not exists uq_sponsor_prospects_event_domain
  on public.sponsor_prospects(event_id, lower(company_domain))
  where company_domain is not null;

drop trigger if exists set_updated_at on public.sponsor_prospects;
create trigger set_updated_at before update on public.sponsor_prospects
  for each row execute function public.handle_updated_at();

alter table public.sponsor_prospects enable row level security;

drop policy if exists "Admins manage sponsor_prospects" on public.sponsor_prospects;
create policy "Admins manage sponsor_prospects"
  on public.sponsor_prospects for all
  using (public.is_admin()) with check (public.is_admin());

-- ── sponsor_decision_makers ──────────────────────────────────
create table if not exists public.sponsor_decision_makers (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references public.sponsor_prospects on delete cascade,
  first_name    text,
  last_name     text,
  title         text,
  seniority     text,
  email         text,
  linkedin_url  text,
  vendor        text,
  vendor_raw    jsonb,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_sponsor_decision_makers_prospect
  on public.sponsor_decision_makers(prospect_id);

alter table public.sponsor_decision_makers enable row level security;

drop policy if exists "Admins manage sponsor_decision_makers" on public.sponsor_decision_makers;
create policy "Admins manage sponsor_decision_makers"
  on public.sponsor_decision_makers for all
  using (public.is_admin()) with check (public.is_admin());

-- ── sponsor_outreach ─────────────────────────────────────────
create table if not exists public.sponsor_outreach (
  id                uuid primary key default gen_random_uuid(),
  prospect_id       uuid not null references public.sponsor_prospects on delete cascade,
  decision_maker_id uuid references public.sponsor_decision_makers on delete set null,
  event_id          uuid not null references public.events on delete cascade,
  step              int not null default 0,
  channel           text not null default 'email',
  sender            text not null default 'resend'
                      check (sender in ('resend','instantly')),
  voice             text not null default 'club',
  subject           text,
  body_html         text,
  body_text         text,
  status            text not null default 'draft'
                      check (status in ('draft','approved','scheduled','sent','failed','replied','bounced')),
  to_email          text,
  approved_by       uuid references public.profiles(id) on delete set null,
  approved_at       timestamptz,
  sent_at           timestamptz,
  external_id       text,
  response_at       timestamptz,
  response_snippet  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_sponsor_outreach_prospect on public.sponsor_outreach(prospect_id);
create index if not exists idx_sponsor_outreach_event    on public.sponsor_outreach(event_id);
create index if not exists idx_sponsor_outreach_status   on public.sponsor_outreach(status);

drop trigger if exists set_updated_at on public.sponsor_outreach;
create trigger set_updated_at before update on public.sponsor_outreach
  for each row execute function public.handle_updated_at();

alter table public.sponsor_outreach enable row level security;

drop policy if exists "Admins manage sponsor_outreach" on public.sponsor_outreach;
create policy "Admins manage sponsor_outreach"
  on public.sponsor_outreach for all
  using (public.is_admin()) with check (public.is_admin());
