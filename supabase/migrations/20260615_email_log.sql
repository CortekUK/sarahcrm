-- Unified log of every email the platform sends (automations, bookings,
-- applications, rejections, invites, admin notifications, …) with the FULL
-- rendered HTML so the team can open and read any message that went out.
-- The member-scoped `communications` table only kept a preview and required
-- a member; this captures guest + admin + automation mail too.
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text,
  html text,
  category text,
  status text not null default 'sent', -- sent | failed
  error text,
  resend_message_id text,
  member_id uuid references public.members on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_log_created_idx on public.email_log (created_at desc);

alter table public.email_log enable row level security;
drop policy if exists email_log_admin_read on public.email_log;
create policy email_log_admin_read on public.email_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
