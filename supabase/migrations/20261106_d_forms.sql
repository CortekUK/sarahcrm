-- ============================================================
-- 20261106_d_forms.sql
--   Website forms (brief: "Forms and CRM capture"). Run AFTER
--   20261106_a_website_rebuild_schema.sql (which adds enquiries.form_data
--   and concierge_requests.form_data) and BEFORE deploying the code.
--
--   * Private storage bucket `form-uploads` for PITCH founder uploads
--     (deck / financials / cap table). Never public by URL. 20MB per file,
--     PDF / PPTX / XLSX / DOCX only — enforced by Storage itself.
--     Visitors upload through a one-time signed upload URL issued by
--     /api/forms/upload (service role); admins download through
--     /api/forms/file (signed URL). storage.objects policies: admin only.
--   * enquiries.form_data size guard (≤ ~10KB) — the public intake caps
--     it already; this stops an oversized direct insert.
--
--   Fully guarded — safe to run twice.
-- ============================================================

-- ── Private bucket ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-uploads',
  'form-uploads',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins read form upload objects" on storage.objects;
create policy "Admins read form upload objects"
  on storage.objects for select
  using (bucket_id = 'form-uploads' and public.is_admin());

drop policy if exists "Admins write form upload objects" on storage.objects;
create policy "Admins write form upload objects"
  on storage.objects for insert
  with check (bucket_id = 'form-uploads' and public.is_admin());

drop policy if exists "Admins update form upload objects" on storage.objects;
create policy "Admins update form upload objects"
  on storage.objects for update
  using (bucket_id = 'form-uploads' and public.is_admin())
  with check (bucket_id = 'form-uploads' and public.is_admin());

drop policy if exists "Admins delete form upload objects" on storage.objects;
create policy "Admins delete form upload objects"
  on storage.objects for delete
  using (bucket_id = 'form-uploads' and public.is_admin());

-- ── enquiries.form_data size guard ──────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enquiries_form_data_size_check') then
    alter table public.enquiries add constraint enquiries_form_data_size_check
      check (form_data is null or length(form_data::text) <= 12000) not valid;
  end if;
end $$;
