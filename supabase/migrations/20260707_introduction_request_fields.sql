-- ============================================================
-- 20260707_introduction_request_fields.sql   (Feature #1)
--
-- Capture the member's own words when they request an introduction:
-- why they'd like the introduction, and what they hope comes of it.
-- Both are optional, free-text, and shown to staff on review.
--
-- Additive + fully guarded — safe to re-run. No RLS changes.
-- ============================================================

alter table public.introductions
  add column if not exists request_reason  text;

alter table public.introductions
  add column if not exists desired_outcome text;
