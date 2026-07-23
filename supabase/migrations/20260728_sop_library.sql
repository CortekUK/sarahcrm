-- ============================================================
-- 20260728_sop_library.sql
--   SOP Library — Module 7 (final) of the Team Accountability system.
--   Builds ON the Foundation (is_admin(), is_staff(), profiles,
--   handle_updated_at()).
--
--   "Knowledge that doesn't walk out the door." Admins author Standard
--   Operating Procedures as rich text; all staff can read the published
--   ones. Each SOP has a title, a free-text category (Onboarding,
--   Sponsorship, Events, Finance, Membership, Renewals … — suggestions,
--   not a rigid enum), a rich-text HTML body (sanitized on render with
--   isomorphic-dompurify, as the rest of the app does), and a
--   draft/published status.
--
-- SECURITY MODEL
--   • ADMINS manage all (create / edit / delete) and see drafts.
--   • STAFF (is_staff()) may SELECT only status='published' rows.
--     No staff INSERT / UPDATE / DELETE policy exists → staff cannot write.
--   • MEMBERS / anon have no policy at all → no access.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── sops ─────────────────────────────────────────────────────
create table if not exists public.sops (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'General',
  body        text,                                  -- sanitized rich-text HTML
  status      text not null default 'draft' check (status in ('draft','published')),
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_sops_category on public.sops(category);
create index if not exists idx_sops_status   on public.sops(status);

drop trigger if exists set_updated_at on public.sops;
create trigger set_updated_at before update on public.sops
  for each row execute function public.handle_updated_at();

alter table public.sops enable row level security;

-- Admins manage everything (create/edit/delete, and see drafts).
drop policy if exists "Admins manage sops" on public.sops;
create policy "Admins manage sops"
  on public.sops for all
  using (public.is_admin()) with check (public.is_admin());

-- Staff can READ published SOPs only. No write policy for staff, so they
-- cannot INSERT/UPDATE/DELETE. Drafts are invisible to them (status filter).
drop policy if exists "Staff read published sops" on public.sops;
create policy "Staff read published sops"
  on public.sops for select
  using (public.is_staff() and status = 'published');
