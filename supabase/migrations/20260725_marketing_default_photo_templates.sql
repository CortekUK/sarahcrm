-- ============================================================
-- 20260725_marketing_default_photo_templates.sql
--   Marketing AI Engine — Template Graphics: AUTO photo graphics.
--
--   Fixes the "text on a flat colour with no photo" problem: every social
--   post generated from an EVENT must auto-produce a PHOTO graphic (the
--   event's real photo, full-bleed, with the AI heading/subtext over it) with
--   NO manual template pick. This migration adds the deterministic default
--   templates the generate route auto-selects.
--
--   Adds:
--     * marketing_templates.is_default_photo  (auto-pick for photo posts)
--     * marketing_templates.is_default_color  (colour fallback: no photo)
--   Seeds (fixed ids, ON CONFLICT DO NOTHING so edits are never clobbered):
--     * "Event photo — portrait"  (photo bg, PRIMARY auto default)
--     * "Event photo — square"    (photo bg, square auto default)
--     * "Brand colour — portrait" (colour bg, no-photo fallback)
--
-- Fully guarded / idempotent — safe to run repeatedly.
-- ============================================================

-- ── Default-template flags (additive) ───────────────────────
alter table public.marketing_templates
  add column if not exists is_default_photo boolean not null default false;
alter table public.marketing_templates
  add column if not exists is_default_color boolean not null default false;

-- ── Seed the auto-default templates (fixed ids, non-clobbering) ──
-- Photo defaults: full-bleed event photo background (a legibility scrim is
-- added at render time), the AI heading + subtext overlaid in the lower zone,
-- plus the always-stamped brand mark. Portrait is the primary auto-pick.
insert into public.marketing_templates (id, name, shape, background, slots, is_default_photo)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Event photo — portrait',
    'portrait',
    '{"type":"photo","value":""}'::jsonb,
    '[
      {"id":"s1","type":"heading","zone":"bottom","align":"left","text_source":"ai","style":{"font":"serif","color":"#F7F3EA","size":80}},
      {"id":"s2","type":"subtext","zone":"bottom","align":"left","text_source":"ai","style":{"font":"sans","color":"#F7F3EA","size":34}}
    ]'::jsonb,
    true
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Event photo — square',
    'square',
    '{"type":"photo","value":""}'::jsonb,
    '[
      {"id":"s1","type":"heading","zone":"bottom","align":"left","text_source":"ai","style":{"font":"serif","color":"#F7F3EA","size":74}},
      {"id":"s2","type":"subtext","zone":"bottom","align":"left","text_source":"ai","style":{"font":"sans","color":"#F7F3EA","size":32}}
    ]'::jsonb,
    true
  )
on conflict (id) do nothing;

-- Colour fallback (ONLY used when an event has no photo, or for topic/audio
-- campaigns with no image): the current text-on-brand-colour look.
insert into public.marketing_templates (id, name, shape, background, slots, is_default_color)
values
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Brand colour — portrait',
    'portrait',
    '{"type":"color","value":"#211D19"}'::jsonb,
    '[
      {"id":"s1","type":"heading","zone":"middle","align":"center","text_source":"ai","style":{"font":"serif","color":"#F7F3EA","size":80}},
      {"id":"s2","type":"subtext","zone":"middle","align":"center","text_source":"ai","style":{"font":"sans","color":"#F7F3EA","size":34}}
    ]'::jsonb,
    true
  )
on conflict (id) do nothing;

-- Backfill the flags on re-run for existing fixed-id rows (in case the rows
-- pre-existed before the flag columns did).
update public.marketing_templates
  set is_default_photo = true
  where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    and is_default_photo = false;
update public.marketing_templates
  set is_default_color = true
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    and is_default_color = false;
