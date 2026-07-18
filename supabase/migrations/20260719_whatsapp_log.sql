-- Unified log of every WhatsApp message the platform sends or receives via
-- the Meta Cloud API (admin-sent templates + free-text, delivery/read status
-- callbacks, and inbound replies). Mirrors email_log: one row per message,
-- service-role inserts, admin-only read. Free-text bodies and template
-- summaries are stored in `body`; the Cloud API `wamid` is kept so webhook
-- status callbacks can update the matching row.
create table if not exists public.whatsapp_log (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  template_name text,                 -- null for free-text / inbound
  body text,                          -- text sent, or a summary for templates / inbound
  category text,
  status text not null default 'sent'
    check (status in ('sent', 'failed', 'delivered', 'read', 'received')),
  error text,
  whatsapp_message_id text,           -- the Cloud API wamid
  member_id uuid references public.members on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_log_created_idx on public.whatsapp_log (created_at desc);
create index if not exists whatsapp_log_message_id_idx on public.whatsapp_log (whatsapp_message_id);

alter table public.whatsapp_log enable row level security;
drop policy if exists whatsapp_log_admin_read on public.whatsapp_log;
create policy whatsapp_log_admin_read on public.whatsapp_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
