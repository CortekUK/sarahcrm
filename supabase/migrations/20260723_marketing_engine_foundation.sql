-- ============================================================
-- 20260723_marketing_engine_foundation.sql
--   Marketing AI Engine — Module 1 (Foundation).
--   Establishes the shared data model for the whole 5-module engine:
--   a marketing CAMPAIGN (one generation batch from a source) and its
--   per-channel ASSETS (one draft piece per channel, moving through the
--   generate -> review -> approve -> publish APPROVAL QUEUE).
--
--   Later modules extend these tables (voices, segments, library); the
--   voice/library columns on marketing_assets are added NOW (additive is
--   fine) so Modules 3 & 5 don't need to touch the core schema.
--
-- SECURITY MODEL
--   * Both tables: RLS enabled.
--   * ADMINS (public.is_admin()) manage everything — FOR ALL.
--   * No staff / member / anon policy → no non-admin access at all.
--     Marketing content is authored and approved exclusively by admins.
--
--   Builds ON the initial schema: public.is_admin() (security definer),
--   public.handle_updated_at() (BEFORE UPDATE bump), public.profiles,
--   public.events, public.email_templates.
--
-- Fully guarded / idempotent — safe to run repeatedly.
-- ============================================================

-- ── marketing_campaigns ──────────────────────────────────────
-- One generation batch, produced from a single SOURCE:
--   * event   → an existing public.events row
--   * topic   → a free-text brief the admin types
--   * audio   → an uploaded recording, transcribed via OpenAI Whisper
create table if not exists public.marketing_campaigns (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  source_type  text not null default 'topic'
                 check (source_type in ('event','topic','audio')),
  event_id     uuid references public.events(id) on delete set null,
  topic_brief  text,
  transcript   text,
  audio_url    text,
  status       text not null default 'draft'
                 check (status in ('draft','generating','ready','archived')),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_marketing_campaigns_status   on public.marketing_campaigns(status);
create index if not exists idx_marketing_campaigns_event    on public.marketing_campaigns(event_id);
create index if not exists idx_marketing_campaigns_created  on public.marketing_campaigns(created_at desc);

-- ── marketing_assets ─────────────────────────────────────────
-- One channel piece within a campaign. Exactly one draft per channel
-- (Module 1 only generates seo_blog + linkedin; the CHECK allows the
-- full channel set so Module 2 needs no migration).
create table if not exists public.marketing_assets (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.marketing_campaigns(id) on delete cascade,
  channel           text not null
                      check (channel in (
                        'seo_blog','recap_blog','linkedin','instagram_feed',
                        'instagram_carousel','instagram_reel','newsletter',
                        'press_release','sponsor_recap')),
  voice             text check (voice in ('club','sarah')),
  title             text,
  body              text,
  body_html         text,
  body_json         jsonb,                         -- newsletter email block tree (Module 2)
  email_template_id uuid references public.email_templates(id) on delete set null,
  status            text not null default 'draft'
                      check (status in ('draft','in_review','approved','scheduled','published','rejected')),
  publish_target    jsonb,                         -- mock/real publish target (platform, etc.)
  scheduled_at      timestamptz,
  published_at      timestamptz,
  -- library tagging (Module 5):
  event_id          uuid references public.events(id) on delete set null,
  sponsor_member_id uuid,
  member_id         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_marketing_assets_campaign on public.marketing_assets(campaign_id);
create index if not exists idx_marketing_assets_channel  on public.marketing_assets(channel);
create index if not exists idx_marketing_assets_status   on public.marketing_assets(status);

-- ── updated_at triggers ──────────────────────────────────────
drop trigger if exists set_updated_at on public.marketing_campaigns;
create trigger set_updated_at before update on public.marketing_campaigns
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.marketing_assets;
create trigger set_updated_at before update on public.marketing_assets
  for each row execute function public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_assets    enable row level security;

drop policy if exists "Admins manage marketing_campaigns" on public.marketing_campaigns;
create policy "Admins manage marketing_campaigns"
  on public.marketing_campaigns for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage marketing_assets" on public.marketing_assets;
create policy "Admins manage marketing_assets"
  on public.marketing_assets for all
  using (public.is_admin()) with check (public.is_admin());
