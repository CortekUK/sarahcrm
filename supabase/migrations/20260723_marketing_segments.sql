-- ============================================================
-- 20260723_marketing_segments.sql
--   Marketing AI Engine — Module 4 (Rule-based segmented email).
--
--   Adds SAVED, RULE-DEFINED segments of members that auto-collect
--   matching members at send time (locked decision 6). These sit ON TOP
--   of the existing hand-picked `audiences` lists — they do not replace
--   them. Sending to a segment reuses the existing Resend campaigns/send
--   pipeline and records the same `email_campaigns` snapshot row.
--
--   `rules` jsonb shape (all keys optional; an omitted / empty key means
--   "no constraint on that dimension"):
--     {
--       "tiers":    string[],   -- membership_tier:   tier_1 | tier_2 | tier_3
--       "statuses": string[],   -- membership_status: active | pending | expired | cancelled | paused
--       "types":    string[],   -- membership_type:   individual | business
--       "tag_ids":  string[],   -- tags.id values (via member_tags)
--       "tag_match": "any" | "all"   -- ANY of the tags vs ALL of the tags (default "any")
--     }
--   When `statuses` is empty the resolver defaults to active members only
--   (mirroring the existing member recipient path in campaigns/send).
--
-- SECURITY MODEL
--   * marketing_segments: RLS enabled; ADMINS (public.is_admin()) manage
--     everything FOR ALL. No non-admin access.
--
--   Builds ON: public.is_admin() (security definer), public.profiles,
--   public.handle_updated_at() (BEFORE UPDATE bump).
--
-- Fully guarded / idempotent — safe to run repeatedly.
-- ============================================================

-- ── marketing_segments ───────────────────────────────────────
create table if not exists public.marketing_segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  rules       jsonb not null default '{}'::jsonb,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── updated_at trigger ───────────────────────────────────────
drop trigger if exists set_updated_at on public.marketing_segments;
create trigger set_updated_at before update on public.marketing_segments
  for each row execute function public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.marketing_segments enable row level security;

drop policy if exists "Admins manage marketing_segments" on public.marketing_segments;
create policy "Admins manage marketing_segments"
  on public.marketing_segments for all
  using (public.is_admin()) with check (public.is_admin());
