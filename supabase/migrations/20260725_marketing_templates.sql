-- ============================================================
-- 20260725_marketing_templates.sql
--   Marketing AI Engine — Template Graphics module.
--
--   A built-in template builder (NOT Canva). The admin lays out an
--   on-brand social graphic from ordered building-block slots
--   (photo / heading / subtext / fixed line); the AI fills the
--   text_source='ai' text slots at generation, a real photo is dropped
--   in, and we render the finished graphic to a PNG shown in the
--   approval queue next to the caption.
--
--   Adds:
--     * public.marketing_templates            (the saved layouts)
--     * marketing_assets.template_id          (which template a piece used)
--     * marketing_assets.graphic_url          (rendered PNG URL)
--     * marketing_assets.slot_values          (per-slot filled text + photo)
--     * public storage bucket 'social-graphics' (rendered PNGs, public read)
--
-- SECURITY MODEL
--   * marketing_templates: RLS enabled; ADMINS (public.is_admin()) manage
--     everything FOR ALL. No non-admin access.
--   * social-graphics bucket: PUBLIC read (rendered graphics are shared to
--     social platforms anyway); writes/updates/deletes require an admin.
--
--   Builds ON: public.is_admin() (security definer), public.profiles,
--   public.handle_updated_at() (BEFORE UPDATE bump), public.marketing_assets.
--
-- Fully guarded / idempotent — safe to run repeatedly. Seed templates use
-- fixed ids + ON CONFLICT (id) DO NOTHING so re-running never clobbers edits.
-- ============================================================

-- ── marketing_templates ──────────────────────────────────────
--   background jsonb : { type:'color'|'photo', value } — a brand colour hex
--     OR (for 'photo') an optional default photo url; the real photo is chosen
--     per-post at generation and stored in marketing_assets.slot_values.
--   slots jsonb : ordered array of
--     { id, type:'photo'|'heading'|'subtext'|'fixed',
--       zone:'top'|'middle'|'bottom', align:'left'|'center'|'right',
--       text_source:'ai'|'fixed', fixed_text?, style?:{font?,color?,size?} }
--   shape : 'square' (1080×1080) | 'portrait' (1080×1350) | 'landscape'
--     (1200×627). landscape is structured-for but not surfaced in the UI yet.
create table if not exists public.marketing_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  shape       text not null default 'square'
                check (shape in ('square','portrait','landscape')),
  background  jsonb not null default '{}'::jsonb,
  slots       jsonb not null default '[]'::jsonb,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── marketing_assets — graphic linkage (additive) ───────────
alter table public.marketing_assets
  add column if not exists template_id uuid references public.marketing_templates(id) on delete set null;
alter table public.marketing_assets
  add column if not exists graphic_url text;
alter table public.marketing_assets
  add column if not exists slot_values jsonb;

-- ── updated_at trigger ───────────────────────────────────────
drop trigger if exists set_updated_at on public.marketing_templates;
create trigger set_updated_at before update on public.marketing_templates
  for each row execute function public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.marketing_templates enable row level security;

drop policy if exists "Admins manage marketing_templates" on public.marketing_templates;
create policy "Admins manage marketing_templates"
  on public.marketing_templates for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Storage bucket: social-graphics (public read) ────────────
insert into storage.buckets (id, name, public)
values ('social-graphics', 'social-graphics', true)
on conflict (id) do nothing;

-- Public read of rendered graphics (they get posted to social anyway).
drop policy if exists "social-graphics public read" on storage.objects;
create policy "social-graphics public read"
  on storage.objects for select
  using (bucket_id = 'social-graphics');

-- Only admins may write/update/delete rendered graphics.
drop policy if exists "social-graphics admin write" on storage.objects;
create policy "social-graphics admin write"
  on storage.objects for insert
  with check (bucket_id = 'social-graphics' and public.is_admin());

drop policy if exists "social-graphics admin update" on storage.objects;
create policy "social-graphics admin update"
  on storage.objects for update
  using (bucket_id = 'social-graphics' and public.is_admin())
  with check (bucket_id = 'social-graphics' and public.is_admin());

drop policy if exists "social-graphics admin delete" on storage.objects;
create policy "social-graphics admin delete"
  on storage.objects for delete
  using (bucket_id = 'social-graphics' and public.is_admin());

-- ── Seed starter templates (non-clobbering, fixed ids) ───────
-- Three on-brand starters the admin can duplicate/edit so they never start
-- from a blank canvas: an Announcement, a Quote card, and an event Recap.
-- Brand palette: cream #F7F3EA, gold #B8975A, warm black #2C2825, dark #211D19.
insert into public.marketing_templates (id, name, shape, background, slots)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Announcement',
    'portrait',
    '{"type":"color","value":"#211D19"}'::jsonb,
    '[
      {"id":"s1","type":"fixed","zone":"top","align":"center","text_source":"fixed","fixed_text":"YOU ARE INVITED","style":{"font":"sans","color":"#B8975A","size":30}},
      {"id":"s2","type":"heading","zone":"middle","align":"center","text_source":"ai","style":{"font":"serif","color":"#F7F3EA","size":84}},
      {"id":"s3","type":"subtext","zone":"middle","align":"center","text_source":"ai","style":{"font":"sans","color":"#F7F3EA","size":34}}
    ]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Quote',
    'square',
    '{"type":"color","value":"#F7F3EA"}'::jsonb,
    '[
      {"id":"s1","type":"heading","zone":"middle","align":"center","text_source":"ai","style":{"font":"serif","color":"#2C2825","size":72}},
      {"id":"s2","type":"subtext","zone":"bottom","align":"center","text_source":"ai","style":{"font":"sans","color":"#B8975A","size":30}}
    ]'::jsonb
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Event recap',
    'portrait',
    '{"type":"photo","value":""}'::jsonb,
    '[
      {"id":"s1","type":"fixed","zone":"top","align":"left","text_source":"fixed","fixed_text":"EVENT RECAP","style":{"font":"sans","color":"#F7F3EA","size":28}},
      {"id":"s2","type":"heading","zone":"bottom","align":"left","text_source":"ai","style":{"font":"serif","color":"#F7F3EA","size":76}},
      {"id":"s3","type":"subtext","zone":"bottom","align":"left","text_source":"ai","style":{"font":"sans","color":"#F7F3EA","size":32}}
    ]'::jsonb
  )
on conflict (id) do nothing;
