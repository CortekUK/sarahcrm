-- AI-proposed data extracted from unmatched inbound Gmail messages: potential
-- new contacts and detected introductions. Recommendation-only — a human
-- reviews and approves (which creates an enquiries row) or dismisses. Nothing
-- is auto-created. One row per (message, kind); service-role inserts,
-- admin-only read.
create table if not exists public.gmail_extractions (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null references public.gmail_messages (gmail_message_id) on delete cascade,
  kind text not null check (kind in ('new_contact', 'introduction')),
  payload jsonb not null default '{}'::jsonb,   -- extracted fields (name/email/company/…)
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  reviewed_by uuid references public.profiles on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gmail_message_id, kind)
);
create index if not exists gmail_extractions_status_idx on public.gmail_extractions (status, created_at desc);

alter table public.gmail_extractions enable row level security;
drop policy if exists gmail_extractions_admin_read on public.gmail_extractions;
create policy gmail_extractions_admin_read on public.gmail_extractions
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
