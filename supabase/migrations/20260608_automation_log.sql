-- Automation log — the "don't email twice" memory for the scheduled
-- email flows. Each automated email records (flow, ref_id) so the next
-- daily run skips anyone already handled. The unique(flow, ref_id)
-- constraint is the idempotency guarantee.
--
-- ref_id meaning per flow:
--   renewal_reminder      → "<member_id>:<renewal_date>"
--   failed_payment        → "<payment_id>"
--   post_event_followup   → "<booking_id>"
--   guest_nurture         → "<guest_email>"
--   invoice_chasing       → "<payment_id>"
--   intro_notification    → "<intro_id>:sent"

create table if not exists public.automation_log (
  id uuid primary key default gen_random_uuid(),
  flow text not null,
  ref_id text not null,
  recipient_email text,
  status text not null default 'sent', -- sent | failed
  detail text,
  created_at timestamptz not null default now(),
  unique (flow, ref_id)
);

create index if not exists automation_log_flow_idx on public.automation_log (flow);
create index if not exists automation_log_created_idx on public.automation_log (created_at desc);

-- Admin-only via service role; RLS on with no public policies (service
-- role bypasses RLS, the only writer/reader).
alter table public.automation_log enable row level security;
