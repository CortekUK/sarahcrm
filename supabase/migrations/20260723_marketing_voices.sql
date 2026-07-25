-- ============================================================
-- 20260723_marketing_voices.sql
--   Marketing AI Engine — Module 3 (Brand voices).
--
--   Adds the two EDITABLE brand voices used across generation:
--     * "The Club" (formal luxury)
--     * "Sarah"    (warm, conversational founder)
--   The admin edits each voice's guidance AND its reference sample
--   posts; generation reads guidance + samples so the model mimics the
--   voice. LinkedIn auto-produces BOTH voices plus a sponsor and a
--   founder-spotlight angle — distinguished on marketing_assets by a new
--   nullable `variant` column (null for every non-LinkedIn channel).
--
-- SECURITY MODEL
--   * marketing_voices: RLS enabled; ADMINS (public.is_admin()) manage
--     everything FOR ALL. No non-admin access.
--
--   Builds ON: public.is_admin() (security definer), public.profiles,
--   public.handle_updated_at() (BEFORE UPDATE bump).
--
-- Fully guarded / idempotent — safe to run repeatedly. The seed uses
-- ON CONFLICT (key) DO NOTHING so re-running never clobbers admin edits.
-- ============================================================

-- ── marketing_voices ─────────────────────────────────────────
-- Two rows, keyed 'club' | 'sarah'. `guidance` is free-text voice
-- direction; `samples` is a JSON array of { label, text } reference posts.
create table if not exists public.marketing_voices (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key in ('club','sarah')),
  name        text not null,
  guidance    text,
  samples     jsonb not null default '[]'::jsonb,   -- array of { label, text }
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── marketing_assets.variant ─────────────────────────────────
-- Distinguishes the multiple LinkedIn drafts within one campaign (and
-- keys the one-draft-per-variant dedup). null for non-LinkedIn channels.
--   'voice_club' | 'voice_sarah' | 'sponsor' | 'founder_spotlight'
alter table public.marketing_assets
  add column if not exists variant text;

-- ── updated_at trigger ───────────────────────────────────────
drop trigger if exists set_updated_at on public.marketing_voices;
create trigger set_updated_at before update on public.marketing_voices
  for each row execute function public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.marketing_voices enable row level security;

drop policy if exists "Admins manage marketing_voices" on public.marketing_voices;
create policy "Admins manage marketing_voices"
  on public.marketing_voices for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Seed the two voices (non-clobbering) ─────────────────────
insert into public.marketing_voices (key, name, guidance, samples)
values
  (
    'club',
    'The Club',
    'Voice — "The Club by Sarah Restrick" (formal luxury): warm, considered and intimate, never corporate or salesy. British English spelling throughout. Confident and understated — this is a private membership community of exceptional people, not a mass mailing list. Short, elegant sentences; specific over flowery. Refer naturally to the three core member experiences where relevant: curated luxury events, bespoke member introductions, and a warm communications practice. Sign off warmly (e.g. "Warm regards").',
    '[]'::jsonb
  ),
  (
    'sarah',
    'Sarah',
    'Voice — "Sarah" (the founder, warm and conversational): first-person, personal and generous. This is Sarah Restrick speaking directly — she founded The Club and cares deeply about the people in it. Warm, human and a little informal, but still elegant and considered — never gushing or salesy. British English. Tell it like a story she is sharing: what she noticed, who she met, why it mattered. Uses "I" and "we"; happy to show a little vulnerability and delight.',
    '[]'::jsonb
  )
on conflict (key) do nothing;
