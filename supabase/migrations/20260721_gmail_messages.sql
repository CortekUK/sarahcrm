-- Synced Gmail messages from the connected inbox (Sarah's), giving every CRM
-- contact a full email conversation history. One row per Gmail message,
-- service-role upserts (from the sync cron), admin-only read. Matched to a
-- member via the counterpart email → profiles.email → members; unmatched
-- messages keep member_id null and surface as "new contacts" for AI extraction.
create table if not exists public.gmail_messages (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,     -- Gmail message id (idempotency key)
  gmail_thread_id text not null,             -- groups messages into a conversation
  direction text not null check (direction in ('inbound', 'outbound')),
  from_email text,
  to_emails text[] not null default '{}',
  counterpart_email text,                    -- the non-mailbox party (match key)
  subject text,
  snippet text,
  body_text text,
  internal_date timestamptz not null,        -- Gmail internalDate
  member_id uuid references public.members on delete set null,  -- null = unmatched
  created_at timestamptz not null default now()
);
create index if not exists gmail_messages_member_idx on public.gmail_messages (member_id, internal_date desc);
create index if not exists gmail_messages_thread_idx on public.gmail_messages (gmail_thread_id);
create index if not exists gmail_messages_counterpart_idx on public.gmail_messages (counterpart_email);
create index if not exists gmail_messages_unmatched_idx on public.gmail_messages (created_at desc) where member_id is null;

alter table public.gmail_messages enable row level security;
drop policy if exists gmail_messages_admin_read on public.gmail_messages;
create policy gmail_messages_admin_read on public.gmail_messages
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
