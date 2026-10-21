-- ============================================================
-- 20261021_member_chat.sql
--   Member chat (v1): DMs, owner-run groups, per-event chats, unread
--   counts, photo attachments, blocks/reports and Sarah's oversight.
--
--   Contract: docs/CHAT-ARCHITECTURE.md. Every read/write goes through the
--   Railway chat service (services/chat) with the service-role key, so RLS is
--   ON with NO client policies — browsers never touch these tables directly.
--
--   Helper functions (chat_unread_counts, chat_list_conversations,
--   chat_conversation_stats, chat_people) are executable by service_role
--   only; EXECUTE is revoked from public/anon/authenticated because some are
--   SECURITY DEFINER and would otherwise leak data over PostgREST.
--
-- Fully guarded — safe to run twice.
-- ============================================================

-- ── Conversations ───────────────────────────────────────────
create table if not exists public.chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('dm','group','event')),
  title           text,
  description     text,
  avatar_url      text,
  dm_key          text unique,
  event_id        uuid unique references public.events(id) on delete cascade,
  is_main         boolean not null default false,
  is_joinable     boolean not null default false,
  created_by      uuid references public.profiles(id) on delete set null,
  closes_at       timestamptz,
  archived_at     timestamptz,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Exactly one main group ("The Club").
create unique index if not exists chat_conversations_one_main_idx
  on public.chat_conversations (is_main) where is_main;

-- Conversation list keyset: last_message_at desc nulls last, id desc.
create index if not exists chat_conversations_last_message_idx
  on public.chat_conversations (last_message_at desc nulls last, id desc);

-- ── Participants ────────────────────────────────────────────
create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner','admin','member')),
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  muted           boolean not null default false,
  left_at         timestamptz,
  primary key (conversation_id, profile_id)
);

-- "My conversations" lookups.
create index if not exists chat_participants_profile_idx
  on public.chat_participants (profile_id, conversation_id)
  where left_at is null;

-- ── Messages ────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id       uuid references public.profiles(id) on delete set null,
  kind            text not null default 'text' check (kind in ('text','system')),
  body            text,
  attachments     jsonb not null default '[]'::jsonb,
  client_id       text,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles(id) on delete set null
);

-- Thread keyset pagination (newest first).
create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at desc, id desc);

-- Optimistic-send de-dupe (NULL client_ids never collide).
create unique index if not exists chat_messages_sender_client_idx
  on public.chat_messages (sender_id, client_id);

-- ── Blocks / reports / staff oversight ──────────────────────
create table if not exists public.chat_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create index if not exists chat_blocks_blocked_idx
  on public.chat_blocks (blocked_id);

create table if not exists public.chat_reports (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  message_id      uuid references public.chat_messages(id) on delete set null,
  reporter_id     uuid references public.profiles(id) on delete set null,
  reason          text not null,
  status          text not null default 'open' check (status in ('open','reviewed','dismissed')),
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists chat_reports_status_created_idx
  on public.chat_reports (status, created_at desc, id desc);

create table if not exists public.chat_staff_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── RLS: on, no policies (service role only) ────────────────
alter table public.chat_conversations enable row level security;
alter table public.chat_participants  enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.chat_blocks        enable row level security;
alter table public.chat_reports       enable row level security;
alter table public.chat_staff_access  enable row level security;

-- ── last_message_at trigger ─────────────────────────────────
create or replace function public.chat_touch_last_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.chat_conversations
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
         updated_at      = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_touch_last_message on public.chat_messages;
create trigger chat_messages_touch_last_message
  after insert on public.chat_messages
  for each row execute function public.chat_touch_last_message();

-- ── Unread counts (per viewer, only conversations with unread > 0) ──
create or replace function public.chat_unread_counts(p_profile uuid)
returns table (conversation_id uuid, unread int)
language sql
stable
security definer
set search_path = public
as $$
  select p.conversation_id, count(m.id)::int as unread
    from public.chat_participants p
    join public.chat_messages m
      on m.conversation_id = p.conversation_id
     and (p.last_read_at is null or m.created_at > p.last_read_at)
     and m.deleted_at is null
     and m.sender_id is distinct from p_profile
   where p.profile_id = p_profile
     and p.left_at is null
   group by p.conversation_id;
$$;

-- ── Conversation list (keyset, nulls last) ──────────────────
--   p_all = oversight scope (every conversation); otherwise only ones the
--   viewer participates in. p_q is an already-escaped ILIKE fragment that
--   matches group titles or the other person's name in DMs.
create or replace function public.chat_list_conversations(
  p_viewer           uuid,
  p_all              boolean,
  p_kind             text,
  p_q                text,
  p_include_archived boolean,
  p_has_cursor       boolean,
  p_after_at         timestamptz,
  p_after_id         uuid,
  p_limit            int
)
returns setof public.chat_conversations
language sql
stable
set search_path = public
as $$
  select c.*
    from public.chat_conversations c
   where (p_all or exists (
            select 1 from public.chat_participants p
             where p.conversation_id = c.id
               and p.profile_id = p_viewer
               and p.left_at is null))
     and (p_kind is null or c.kind = p_kind)
     and (p_include_archived or c.archived_at is null)
     and (p_q is null
          or c.title ilike '%' || p_q || '%'
          or (c.kind = 'dm' and exists (
                select 1 from public.profiles pr
                 where pr.id::text = any (string_to_array(c.dm_key, ':'))
                   and pr.id <> p_viewer
                   and (coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')) ilike '%' || p_q || '%')))
     and (not p_has_cursor
          or (p_after_at is not null and (c.last_message_at < p_after_at
                                          or (c.last_message_at = p_after_at and c.id < p_after_id)
                                          or c.last_message_at is null))
          or (p_after_at is null and c.last_message_at is null and c.id < p_after_id))
   order by c.last_message_at desc nulls last, c.id desc
   limit greatest(1, least(p_limit, 100));
$$;

-- ── Per-conversation stats for a page of summaries ──────────
create or replace function public.chat_conversation_stats(p_ids uuid[])
returns table (conversation_id uuid, participant_count int, last_message jsonb)
language sql
stable
set search_path = public
as $$
  select c.id,
         (select count(*)::int from public.chat_participants p
           where p.conversation_id = c.id and p.left_at is null),
         (select to_jsonb(m) from public.chat_messages m
           where m.conversation_id = c.id
           order by m.created_at desc, m.id desc
           limit 1)
    from unnest(p_ids) as c(id);
$$;

-- ── People the viewer may DM (keyset on lower(name), id) ────
--   p_all = admin viewer (all active members + admins); otherwise members
--   introduced (accepted/completed) + admins. Self and blocks excluded.
create or replace function public.chat_people(
  p_viewer     uuid,
  p_all        boolean,
  p_q          text,
  p_has_cursor boolean,
  p_after_name text,
  p_after_id   uuid,
  p_limit      int
)
returns table (
  id uuid, first_name text, last_name text, avatar_url text,
  company_name text, job_title text, role text, sort_name text
)
language sql
stable
set search_path = public
as $$
  with me as (
    select m.id from public.members m
     where m.profile_id = p_viewer and m.deleted_at is null
  ),
  introduced as (
    select case when i.member_a_id in (select id from me) then i.member_b_id else i.member_a_id end as member_id
      from public.introductions i
     where i.status in ('accepted','completed')
       and (i.member_a_id in (select id from me) or i.member_b_id in (select id from me))
  ),
  candidate_ids as (
    select pr.id from public.profiles pr where pr.role = 'admin'
    union
    select pr.id
      from public.profiles pr
      join public.members m on m.profile_id = pr.id
     where pr.role = 'member'
       and m.membership_status = 'active'
       and m.deleted_at is null
       and (p_all or m.id in (select member_id from introduced))
  ),
  people as (
    select pr.id, pr.first_name, pr.last_name, pr.avatar_url, pr.company_name, pr.job_title,
           pr.role::text as role,
           lower(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, ''))) as sort_name
      from public.profiles pr
     where pr.id in (select id from candidate_ids)
       and pr.id <> p_viewer
       and not exists (select 1 from public.chat_blocks b
                        where (b.blocker_id = p_viewer and b.blocked_id = pr.id)
                           or (b.blocker_id = pr.id and b.blocked_id = p_viewer))
  )
  select * from people pe
   where (p_q is null
          or (coalesce(pe.first_name, '') || ' ' || coalesce(pe.last_name, '')) ilike '%' || p_q || '%'
          or pe.company_name ilike '%' || p_q || '%')
     and (not p_has_cursor or (pe.sort_name, pe.id) > (p_after_name, p_after_id))
   order by pe.sort_name, pe.id
   limit greatest(1, least(p_limit, 100));
$$;

-- Service role only.
revoke execute on function public.chat_unread_counts(uuid) from public, anon, authenticated;
revoke execute on function public.chat_list_conversations(uuid, boolean, text, text, boolean, boolean, timestamptz, uuid, int) from public, anon, authenticated;
revoke execute on function public.chat_conversation_stats(uuid[]) from public, anon, authenticated;
revoke execute on function public.chat_people(uuid, boolean, text, boolean, text, uuid, int) from public, anon, authenticated;
grant execute on function public.chat_unread_counts(uuid) to service_role;
grant execute on function public.chat_list_conversations(uuid, boolean, text, text, boolean, boolean, timestamptz, uuid, int) to service_role;
grant execute on function public.chat_conversation_stats(uuid[]) to service_role;
grant execute on function public.chat_people(uuid, boolean, text, boolean, text, uuid, int) to service_role;

-- ── Private attachment bucket ───────────────────────────────
--   Size/mime limits are enforced by Storage itself, since signed upload URLs
--   bypass the chat service once issued.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do nothing;

-- ── Seed the main group "The Club" ──────────────────────────
--   created_by falls back to NULL if Sarah's profile id isn't present.
insert into public.chat_conversations (kind, title, description, is_main, is_joinable, created_by, last_message_at)
select 'group', 'The Club', 'Everyone in The Club by Sarah Restrick.', true, false,
       (select id from public.profiles where id = 'a0000000-0000-4000-a000-000000000001'),
       null
on conflict (is_main) where is_main do nothing;
