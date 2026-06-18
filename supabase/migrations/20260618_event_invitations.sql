-- Event invitations: a true invite list per event, distinct from bookings.
-- The team adds people they have invited (members or external contacts); each
-- invitee starts as invited and flips to confirmed when they actually book the
-- event (auto-linked by email in the checkout/book routes), or manually. This
-- powers the Invited-vs-Confirmed guest-list views on the event page.

create table if not exists public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  invitee_name text,
  invitee_email text,
  invitee_company text,
  status text not null default 'invited',
  booking_id uuid references public.bookings(id) on delete set null,
  notes text,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_invitations_event_id_idx
  on public.event_invitations (event_id);

-- One invite per email per event (case-insensitive). NULL emails are exempt.
create unique index if not exists event_invitations_event_email_key
  on public.event_invitations (event_id, lower(invitee_email))
  where invitee_email is not null;

alter table public.event_invitations enable row level security;

drop policy if exists event_invitations_admin_all on public.event_invitations;
create policy event_invitations_admin_all on public.event_invitations
  for all to public using (is_admin()) with check (is_admin());
