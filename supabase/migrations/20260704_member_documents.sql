-- ============================================================
-- 20260704_member_documents.sql   (Phase 1 · Feature #4)
--
-- Member Document Vault — upload & store onboarding forms, introducer /
-- commission agreements and NDAs against a member profile.
--
-- Files live in a PRIVATE Supabase Storage bucket ('member-documents');
-- they are never public-by-URL. Admins access them via short-lived signed
-- URLs generated from their authenticated session. Table rows carry the
-- storage path + metadata, not a public URL.
--
-- Fully guarded (if not exists / drop policy if exists) — safe to re-run and
-- safe against the existing schema.
-- ============================================================

-- ── Table ────────────────────────────────────────────────────
create table if not exists public.member_documents (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  title        text,
  doc_type     text not null default 'other',
  file_name    text not null,
  file_path    text not null,          -- object path inside the private bucket
  content_type text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_member_documents_member on public.member_documents(member_id);
create index if not exists idx_member_documents_created on public.member_documents(created_at desc);

-- ── RLS — admin-only ─────────────────────────────────────────
alter table public.member_documents enable row level security;

drop policy if exists "Admins manage member_documents" on public.member_documents;
create policy "Admins manage member_documents"
  on public.member_documents
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── Private storage bucket ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('member-documents', 'member-documents', false)
on conflict (id) do nothing;

-- Only admins can read/write objects in this bucket. Because the bucket is
-- private, reads happen through signed URLs — which still require this select
-- grant to be issued for the requesting (admin) session.
drop policy if exists "Admins read member document objects" on storage.objects;
create policy "Admins read member document objects"
  on storage.objects for select
  using (bucket_id = 'member-documents' and public.is_admin());

drop policy if exists "Admins write member document objects" on storage.objects;
create policy "Admins write member document objects"
  on storage.objects for insert
  with check (bucket_id = 'member-documents' and public.is_admin());

drop policy if exists "Admins update member document objects" on storage.objects;
create policy "Admins update member document objects"
  on storage.objects for update
  using (bucket_id = 'member-documents' and public.is_admin())
  with check (bucket_id = 'member-documents' and public.is_admin());

drop policy if exists "Admins delete member document objects" on storage.objects;
create policy "Admins delete member document objects"
  on storage.objects for delete
  using (bucket_id = 'member-documents' and public.is_admin());
