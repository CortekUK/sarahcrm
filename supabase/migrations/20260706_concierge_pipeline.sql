-- ============================================================
-- 20260706_concierge_pipeline.sql   (Feature #7 · Concierge)
--
-- Extends the EXISTING public.concierge_requests table (created in
-- 20260216201825_initial_schema.sql) with the luxury-concierge
-- pipeline + commercial fields: supplier sourcing, quoting, margin and
-- commission tracking, delivery and feedback.
--
-- Additive & fully guarded — safe to re-run. Adds columns only
-- (add column if not exists), a status CHECK and a priority CHECK
-- (drop-then-add). Does NOT recreate the table and does NOT touch RLS —
-- the existing policies (admin-all via is_admin(); member SELECT/INSERT
-- own) already cover this module.
-- ============================================================

-- ── Pipeline + commercial columns ───────────────────────────
alter table public.concierge_requests
  add column if not exists assigned_to        uuid references public.profiles(id) on delete set null;
alter table public.concierge_requests
  add column if not exists supplier_name       text;
alter table public.concierge_requests
  add column if not exists supplier_cost_pence integer;
alter table public.concierge_requests
  add column if not exists sale_price_pence     integer;
alter table public.concierge_requests
  add column if not exists commission_pence     integer;
alter table public.concierge_requests
  add column if not exists priority             text default 'medium';
alter table public.concierge_requests
  add column if not exists delivered_at         timestamptz;
alter table public.concierge_requests
  add column if not exists feedback_note        text;
alter table public.concierge_requests
  add column if not exists feedback_rating      integer;

-- ── Status pipeline CHECK — keep default 'pending' ──────────
-- enquiry → assigned → sourcing → quoted → accepted → booked →
-- delivered → feedback  (plus declined / cancelled). 'pending' is the
-- initial/enquiry state carried over from the original schema default.
alter table public.concierge_requests
  drop constraint if exists concierge_requests_status_check;
alter table public.concierge_requests
  add constraint concierge_requests_status_check
  check (status in (
    'pending', 'assigned', 'sourcing', 'quoted', 'accepted',
    'booked', 'delivered', 'feedback', 'declined', 'cancelled'
  ));

-- ── Priority CHECK ──────────────────────────────────────────
alter table public.concierge_requests
  drop constraint if exists concierge_requests_priority_check;
alter table public.concierge_requests
  add constraint concierge_requests_priority_check
  check (priority in ('low', 'medium', 'high'));

-- ── Helpful indexes ─────────────────────────────────────────
create index if not exists idx_concierge_status   on public.concierge_requests(status);
create index if not exists idx_concierge_assigned on public.concierge_requests(assigned_to);
