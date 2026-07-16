-- ============================================================
-- 20260717_event_expenses.sql   (Feature #2 · Finance dashboards)
--
-- Cost side of event P&L. Each row is one itemised cost against an
-- event (venue, catering, AV, talent, etc.). Event profit =
-- ticket revenue (confirmed bookings) + committed sponsorship
-- − Σ event_expenses.amount_pence.
--
-- Admin-only CRM tool. Fully guarded — safe to re-run.
-- ============================================================

-- ── event_expenses ───────────────────────────────────────────
create table if not exists public.event_expenses (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  label        text not null,
  amount_pence integer not null default 0,
  category     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_event_expenses_event on public.event_expenses(event_id);

-- updated_at touch trigger — reuse the shared function from the
-- initial schema (public.handle_updated_at()).
drop trigger if exists set_updated_at on public.event_expenses;
create trigger set_updated_at before update on public.event_expenses
  for each row execute function public.handle_updated_at();

-- ── RLS — admin-only ─────────────────────────────────────────
alter table public.event_expenses enable row level security;

drop policy if exists "Admins manage event_expenses" on public.event_expenses;
create policy "Admins manage event_expenses"
  on public.event_expenses for all
  using (public.is_admin()) with check (public.is_admin());
