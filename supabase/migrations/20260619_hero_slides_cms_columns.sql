-- ============================================================
-- 20260619_hero_slides_cms_columns.sql
--
-- CATCH-UP MIGRATION — brings the migration folder in line with the
-- live database.
--
-- The hero-slide CMS content columns live on the DB but were only ever
-- applied via the one-off script `scripts/migrate-hero-cms.mjs`, never as
-- a migration. This codifies exactly what that script did so a clean build
-- reproduces the live `hero_slides` shape.
--
-- Base table: 20260506_website_content.sql.
-- Fully guarded — a no-op on the live DB.
-- ============================================================

alter table public.hero_slides
  add column if not exists media_type          text not null default 'image',
  add column if not exists video_url           text,
  add column if not exists video_poster_url    text,
  add column if not exists eyebrow             text,
  add column if not exists headline            text,
  add column if not exists lede                text,
  add column if not exists cta_primary_label   text,
  add column if not exists cta_primary_href    text,
  add column if not exists cta_secondary_label text,
  add column if not exists cta_secondary_href  text;

-- media_type is a two-value enum-by-check.
alter table public.hero_slides
  drop constraint if exists hero_slides_media_type_check;
alter table public.hero_slides
  add constraint hero_slides_media_type_check
  check (media_type in ('image', 'video'));

-- Video slides carry no image_url/alt_text, so those became nullable on live.
alter table public.hero_slides alter column image_url drop not null;
alter table public.hero_slides alter column alt_text  drop not null;
