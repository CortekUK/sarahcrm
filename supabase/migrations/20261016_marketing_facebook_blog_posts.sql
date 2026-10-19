-- ============================================================
-- 20261016_marketing_facebook_blog_posts.sql
--   Marketing AI Engine — Facebook + TikTok channels + website blog publishing.
--
--   1. marketing_assets.channel CHECK gains 'facebook' (Facebook post copy)
--      and 'tiktok' (TikTok photo/video post caption), both published
--      through Metricool like LinkedIn / Instagram. ('tiktok' was added to
--      this file in place before it was first applied — no separate
--      migration.)
--   2. public.blog_posts — the public website's blog ("The Journal").
--      An APPROVED seo_blog / recap_blog marketing asset is published here
--      by BlogPublisher (src/lib/marketing/publish/blog.ts) and rendered at
--      /blog and /blog/[slug]. One post per marketing asset (unique
--      marketing_asset_id), so approving again after an unpublish re-uses
--      the same row + slug.
--
-- SECURITY MODEL (blog_posts)
--   * RLS enabled.
--   * PUBLIC (anon + authenticated) may SELECT only rows with
--     status = 'published' — the public site reads with the anon key.
--   * ADMINS (public.is_admin()) manage everything — FOR ALL. The
--     publisher writes with the service role (bypasses RLS) after the
--     asset route's requireAdmin() check.
--
--   Builds ON: public.is_admin(), public.handle_updated_at(),
--   public.events, public.profiles, public.marketing_assets.
--
-- Fully guarded / idempotent — safe to run repeatedly.
-- ============================================================

-- ── 1. marketing_assets.channel — add 'facebook' + 'tiktok' ─
-- The original inline CHECK (20260723_marketing_engine_foundation.sql) is
-- auto-named marketing_assets_channel_check; drop + re-add with the
-- extended set. The DO block also drops any differently-named CHECK on
-- the channel column (defensive — the live name was never pinned).
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.marketing_assets'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%channel%seo_blog%'
  loop
    execute format('alter table public.marketing_assets drop constraint %I', c.conname);
  end loop;
end
$$;
alter table public.marketing_assets drop constraint if exists marketing_assets_channel_check;
alter table public.marketing_assets add constraint marketing_assets_channel_check
  check (channel in (
    'seo_blog','recap_blog','linkedin','instagram_feed',
    'instagram_carousel','instagram_reel','facebook','tiktok','newsletter',
    'press_release','sponsor_recap'));

-- ── 2. blog_posts ────────────────────────────────────────────
create table if not exists public.blog_posts (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  title              text not null,
  excerpt            text,                        -- SEO meta description + listing teaser
  body_html          text not null default '',    -- sanitized HTML (rendered from the asset's Markdown)
  body_markdown      text,                        -- the approved source copy
  hero_image_url     text,                        -- asset graphic_url, else the linked event's cover
  event_id           uuid references public.events(id) on delete set null,
  marketing_asset_id uuid unique references public.marketing_assets(id) on delete set null,
  source_channel     text check (source_channel in ('seo_blog','recap_blog')),
  status             text not null default 'published'
                       check (status in ('published','unpublished')),
  published_at       timestamptz,
  unpublished_at     timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_blog_posts_status_published
  on public.blog_posts(status, published_at desc);
create index if not exists idx_blog_posts_event on public.blog_posts(event_id);

drop trigger if exists set_updated_at on public.blog_posts;
create trigger set_updated_at before update on public.blog_posts
  for each row execute function public.handle_updated_at();

alter table public.blog_posts enable row level security;

drop policy if exists "Public read published blog_posts" on public.blog_posts;
create policy "Public read published blog_posts"
  on public.blog_posts for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins manage blog_posts" on public.blog_posts;
create policy "Admins manage blog_posts"
  on public.blog_posts for all
  using (public.is_admin()) with check (public.is_admin());
