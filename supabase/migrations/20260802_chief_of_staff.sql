-- ============================================================
-- 20260802_chief_of_staff.sql
--   AI Chief of Staff — Sarah's daily leadership briefing.
--
--   ONE table that stores the per-date aggregated briefing plus the
--   AI/fallback prose narrative. One row per report_date (upsert).
--     • chief_of_staff_reports — { sections jsonb, narrative text }.
--
--   Builds ON the Foundation (is_admin(), profiles, handle_updated_at()).
--
-- SECURITY MODEL
--   • ADMIN-ONLY. `for all using is_admin() with check is_admin()`.
--     No staff / member / anon policy → no access for anyone else.
--   • Written by the untyped service-role client (report route + cron
--     flow), so it is intentionally absent from src/types/database.ts.
--
-- Fully guarded — safe to run twice.
-- ============================================================

create table if not exists public.chief_of_staff_reports (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null unique,
  sections      jsonb not null default '{}'::jsonb,
  narrative     text,
  generated_at  timestamptz not null default now(),
  generated_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_chief_of_staff_reports_date
  on public.chief_of_staff_reports(report_date desc);

drop trigger if exists set_updated_at on public.chief_of_staff_reports;
create trigger set_updated_at before update on public.chief_of_staff_reports
  for each row execute function public.handle_updated_at();

alter table public.chief_of_staff_reports enable row level security;

drop policy if exists "Admins manage chief_of_staff_reports" on public.chief_of_staff_reports;
create policy "Admins manage chief_of_staff_reports"
  on public.chief_of_staff_reports for all
  using (public.is_admin()) with check (public.is_admin());
