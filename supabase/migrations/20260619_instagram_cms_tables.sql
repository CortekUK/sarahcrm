-- ============================================================
-- 20260619_instagram_cms_tables.sql
--
-- CATCH-UP MIGRATION — brings the migration folder in line with the
-- live database.
--
-- `instagram_posts` and `instagram_settings` exist on the live DB but were
-- created out-of-band (dashboard / SQL editor) — they appear only in app
-- code (src/types/database.ts, InstagramChapter, InstagramAdminPage) and in
-- no migration. This codifies them so a clean build reproduces them.
--
-- Column shapes are taken verbatim from the live PostgREST schema. RLS is
-- reconstructed to match every sibling CMS table (public reads active rows,
-- admins manage everything) and the site's actual usage — the public
-- InstagramChapter reads active rows, the admin page manages them.
--
-- Fully guarded — a no-op on the live DB.
-- ============================================================

-- ── instagram_settings — the single account/profile row ──────
create table if not exists public.instagram_settings (
  id             uuid primary key default gen_random_uuid(),
  handle         text,
  display_name   text,
  profile_url    text,
  avatar_url     text,
  bio            text,
  follower_count integer,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── instagram_posts — the curated grid ───────────────────────
create table if not exists public.instagram_posts (
  id            uuid primary key default gen_random_uuid(),
  image_url     text,
  caption       text,
  post_url      text,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- updated_at triggers (reuse the shared helper if present, else create one).
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_instagram_settings_updated_at on public.instagram_settings;
create trigger trg_instagram_settings_updated_at
  before update on public.instagram_settings
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_instagram_posts_updated_at on public.instagram_posts;
create trigger trg_instagram_posts_updated_at
  before update on public.instagram_posts
  for each row execute function public.tg_set_updated_at();

-- ── RLS: public reads active rows, admins manage everything ──
alter table public.instagram_settings enable row level security;
alter table public.instagram_posts    enable row level security;

drop policy if exists "Public read active instagram_settings" on public.instagram_settings;
create policy "Public read active instagram_settings"
  on public.instagram_settings for select using (is_active = true);

drop policy if exists "Admins manage instagram_settings" on public.instagram_settings;
create policy "Admins manage instagram_settings"
  on public.instagram_settings for all
  using (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Public read active instagram_posts" on public.instagram_posts;
create policy "Public read active instagram_posts"
  on public.instagram_posts for select using (is_active = true);

drop policy if exists "Admins manage instagram_posts" on public.instagram_posts;
create policy "Admins manage instagram_posts"
  on public.instagram_posts for all
  using (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin')
  );
