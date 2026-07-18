-- ============================================================
-- 20260718_sponsor_uploads.sql   (Feature #8 · Sponsor asset uploads)
--
-- Lets a sponsor UPLOAD their assets + mark items provided from the
-- token-based Sponsor Portal (no login — the booking_token is the auth).
--
--   • sponsor_deliverables gains the submission columns (file_path,
--     file_name, file_size, submitted_at, sponsor_note).
--   • A PRIVATE storage bucket 'sponsor-assets' holds the files (never
--     public-by-URL) — mirrors the member-documents vault. Sponsors write
--     via a token-gated server route using the service-role client (which
--     bypasses RLS); admins read them through short-lived signed URLs, so
--     the storage.objects policies grant admin/service-role access only.
--
-- Fully guarded (add column if not exists / on conflict do nothing /
-- drop policy if exists) — safe to re-run and safe against the schema.
-- ============================================================

-- ── sponsor_deliverables: submission columns ─────────────────
alter table public.sponsor_deliverables
  add column if not exists file_path    text;
alter table public.sponsor_deliverables
  add column if not exists file_name    text;
alter table public.sponsor_deliverables
  add column if not exists file_size    integer;
alter table public.sponsor_deliverables
  add column if not exists submitted_at timestamptz;
alter table public.sponsor_deliverables
  add column if not exists sponsor_note text;

-- ── Private storage bucket ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('sponsor-assets', 'sponsor-assets', false)
on conflict (id) do nothing;

-- Sponsors upload through a token-gated server route on the service-role
-- client (which bypasses these policies). The policies below exist so ADMINS
-- can read/manage the objects (signed URLs are issued for their session) and
-- nobody public can. No public read.
drop policy if exists "Admins read sponsor asset objects" on storage.objects;
create policy "Admins read sponsor asset objects"
  on storage.objects for select
  using (bucket_id = 'sponsor-assets' and public.is_admin());

drop policy if exists "Admins write sponsor asset objects" on storage.objects;
create policy "Admins write sponsor asset objects"
  on storage.objects for insert
  with check (bucket_id = 'sponsor-assets' and public.is_admin());

drop policy if exists "Admins update sponsor asset objects" on storage.objects;
create policy "Admins update sponsor asset objects"
  on storage.objects for update
  using (bucket_id = 'sponsor-assets' and public.is_admin())
  with check (bucket_id = 'sponsor-assets' and public.is_admin());

drop policy if exists "Admins delete sponsor asset objects" on storage.objects;
create policy "Admins delete sponsor asset objects"
  on storage.objects for delete
  using (bucket_id = 'sponsor-assets' and public.is_admin());
