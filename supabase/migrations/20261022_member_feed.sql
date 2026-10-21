-- ============================================================
-- 20261022_member_feed.sql
--   Member Feed: one Club-wide feed (group_id NULL — the main group "The
--   Club"'s posts ARE the main feed) plus a Posts feed per group
--   conversation, with likes, comments (one level of replies), admin
--   moderation (pin / hide / remove) and in-app notifications (new comment
--   on my post, reply to my comment, new post in a group I'm in).
--
--   Contract: docs/CHAT-ARCHITECTURE.md § Member Feed. Like chat, every
--   read/write goes through services/chat with the service-role key, so RLS
--   is ON with NO client policies. Helper functions are EXECUTE service_role
--   only (revoked from public/anon/authenticated).
--
--   Depends on 20261021_member_chat.sql (chat_conversations,
--   chat_participants, chat_reports). Fully guarded — safe to run twice.
-- ============================================================

-- ── Posts ───────────────────────────────────────────────────
create table if not exists public.feed_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid references public.profiles(id) on delete set null,
  -- NULL = main Club feed; otherwise a kind='group' conversation's feed.
  group_id      uuid references public.chat_conversations(id) on delete cascade,
  body          text not null default '' check (char_length(body) <= 5000),
  -- [{ path, mime, size, width?, height? }] in the private feed-media bucket.
  images        jsonb not null default '[]'::jsonb
                check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 4),
  client_id     text,
  pinned_at     timestamptz,
  pinned_by     uuid references public.profiles(id) on delete set null,
  hidden_at     timestamptz,
  hidden_by     uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles(id) on delete set null,
  edited_at     timestamptz,
  like_count    int not null default 0,
  comment_count int not null default 0,
  created_at    timestamptz not null default now()
);

-- Feed keyset: (group_id, created_at desc, id desc), live posts only.
create index if not exists feed_posts_group_created_idx
  on public.feed_posts (group_id, created_at desc, id desc)
  where deleted_at is null;

-- Pinned posts for a feed's first page.
create index if not exists feed_posts_group_pinned_idx
  on public.feed_posts (group_id, pinned_at desc)
  where pinned_at is not null and deleted_at is null;

-- Optimistic-create de-dupe (NULL client_ids never collide).
create unique index if not exists feed_posts_author_client_idx
  on public.feed_posts (author_id, client_id);

-- ── Comments (one level of replies) ─────────────────────────
create table if not exists public.feed_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.feed_posts(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  parent_id   uuid references public.feed_comments(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  client_id   text,
  reply_count int not null default 0,
  hidden_at   timestamptz,
  hidden_by   uuid references public.profiles(id) on delete set null,
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Top-level comments, newest first (load older on demand).
create index if not exists feed_comments_post_created_idx
  on public.feed_comments (post_id, created_at desc, id desc)
  where parent_id is null and deleted_at is null;

-- Replies, oldest first.
create index if not exists feed_comments_parent_created_idx
  on public.feed_comments (parent_id, created_at, id)
  where parent_id is not null and deleted_at is null;

create unique index if not exists feed_comments_author_client_idx
  on public.feed_comments (author_id, client_id);

-- ── Likes ───────────────────────────────────────────────────
create table if not exists public.feed_likes (
  post_id    uuid not null references public.feed_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create index if not exists feed_likes_profile_idx
  on public.feed_likes (profile_id, post_id);

-- ── In-app notifications ────────────────────────────────────
create table if not exists public.member_notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('comment','reply','group_post')),
  actor_id     uuid references public.profiles(id) on delete set null,
  post_id      uuid references public.feed_posts(id) on delete cascade,
  comment_id   uuid references public.feed_comments(id) on delete cascade,
  group_id     uuid references public.chat_conversations(id) on delete cascade,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists member_notifications_recipient_created_idx
  on public.member_notifications (recipient_id, created_at desc, id desc);

create index if not exists member_notifications_unread_idx
  on public.member_notifications (recipient_id)
  where read_at is null;

-- ── Feed reports flow into the existing chat Reports queue ──
--   conversation_id stays NOT NULL: feed reports use the post's group, or
--   the main group "The Club" for main-feed posts.
alter table public.chat_reports add column if not exists post_id    uuid references public.feed_posts(id) on delete set null;
alter table public.chat_reports add column if not exists comment_id uuid references public.feed_comments(id) on delete set null;

-- ── RLS: on, no policies (service role only) ────────────────
alter table public.feed_posts           enable row level security;
alter table public.feed_comments        enable row level security;
alter table public.feed_likes           enable row level security;
alter table public.member_notifications enable row level security;

-- ── One level of replies, same post ─────────────────────────
create or replace function public.feed_comments_check_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent record;
begin
  if new.parent_id is null then
    return new;
  end if;
  select post_id, parent_id into parent from public.feed_comments where id = new.parent_id;
  if not found then
    raise exception 'parent comment not found';
  end if;
  if parent.parent_id is not null then
    raise exception 'replies are one level deep';
  end if;
  if parent.post_id <> new.post_id then
    raise exception 'reply must be on the same post';
  end if;
  return new;
end;
$$;

drop trigger if exists feed_comments_check_parent on public.feed_comments;
create trigger feed_comments_check_parent
  before insert or update of parent_id, post_id on public.feed_comments
  for each row execute function public.feed_comments_check_parent();

-- ── Counters ────────────────────────────────────────────────
--   like_count: rows in feed_likes. comment_count / reply_count: VISIBLE
--   comments (not deleted, not hidden), so the number members see matches
--   what they can open. Transitions are handled as deltas.
create or replace function public.feed_likes_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.feed_posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.feed_posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists feed_likes_count on public.feed_likes;
create trigger feed_likes_count
  after insert or delete on public.feed_likes
  for each row execute function public.feed_likes_count();

create or replace function public.feed_comments_count()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  was_visible int := 0;
  now_visible int := 0;
  delta int;
  post uuid;
  parent uuid;
begin
  if tg_op = 'INSERT' then
    post := new.post_id;
    parent := new.parent_id;
    if new.deleted_at is null and new.hidden_at is null then now_visible := 1; end if;
  elsif tg_op = 'UPDATE' then
    post := new.post_id;
    parent := new.parent_id;
    if old.deleted_at is null and old.hidden_at is null then was_visible := 1; end if;
    if new.deleted_at is null and new.hidden_at is null then now_visible := 1; end if;
  else
    post := old.post_id;
    parent := old.parent_id;
    if old.deleted_at is null and old.hidden_at is null then was_visible := 1; end if;
  end if;
  delta := now_visible - was_visible;
  if delta <> 0 then
    update public.feed_posts set comment_count = greatest(comment_count + delta, 0) where id = post;
    if parent is not null then
      update public.feed_comments set reply_count = greatest(reply_count + delta, 0) where id = parent;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists feed_comments_count on public.feed_comments;
create trigger feed_comments_count
  after insert or update of deleted_at, hidden_at or delete on public.feed_comments
  for each row execute function public.feed_comments_count();

-- ── Feed page (keyset, newest first, pinned excluded) ───────
--   p_group NULL = main feed. p_include_hidden = moderator; otherwise hidden
--   posts are only returned to their own author.
create or replace function public.feed_list_posts(
  p_group          uuid,
  p_viewer         uuid,
  p_include_hidden boolean,
  p_has_cursor     boolean,
  p_after_at       timestamptz,
  p_after_id       uuid,
  p_limit          int
)
returns setof public.feed_posts
language sql
stable
set search_path = public
as $$
  select p.*
    from public.feed_posts p
   where p.group_id is not distinct from p_group
     and p.deleted_at is null
     and p.pinned_at is null
     and (p_include_hidden or p.hidden_at is null or p.author_id = p_viewer)
     and (not p_has_cursor or (p.created_at, p.id) < (p_after_at, p_after_id))
   order by p.created_at desc, p.id desc
   limit greatest(1, least(p_limit, 51));
$$;

-- ── Top-level comments (newest first) ───────────────────────
create or replace function public.feed_list_comments(
  p_post           uuid,
  p_viewer         uuid,
  p_include_hidden boolean,
  p_has_cursor     boolean,
  p_after_at       timestamptz,
  p_after_id       uuid,
  p_limit          int
)
returns setof public.feed_comments
language sql
stable
set search_path = public
as $$
  select c.*
    from public.feed_comments c
   where c.post_id = p_post
     and c.parent_id is null
     and c.deleted_at is null
     and (p_include_hidden or c.hidden_at is null or c.author_id = p_viewer)
     and (not p_has_cursor or (c.created_at, c.id) < (p_after_at, p_after_id))
   order by c.created_at desc, c.id desc
   limit greatest(1, least(p_limit, 51));
$$;

-- ── Replies (oldest first) ──────────────────────────────────
create or replace function public.feed_list_replies(
  p_parent         uuid,
  p_viewer         uuid,
  p_include_hidden boolean,
  p_has_cursor     boolean,
  p_after_at       timestamptz,
  p_after_id       uuid,
  p_limit          int
)
returns setof public.feed_comments
language sql
stable
set search_path = public
as $$
  select c.*
    from public.feed_comments c
   where c.parent_id = p_parent
     and c.deleted_at is null
     and (p_include_hidden or c.hidden_at is null or c.author_id = p_viewer)
     and (not p_has_cursor or (c.created_at, c.id) > (p_after_at, p_after_id))
   order by c.created_at, c.id
   limit greatest(1, least(p_limit, 51));
$$;

-- ── Group-post fan-out: ONE insert … select for big groups ──
--   Every active participant except the author and anyone who muted the
--   group. Returns the inserted rows so the service can push them live.
create or replace function public.feed_notify_group_post(
  p_post  uuid,
  p_group uuid,
  p_actor uuid
)
returns setof public.member_notifications
language sql
volatile
set search_path = public
as $$
  insert into public.member_notifications (recipient_id, kind, actor_id, post_id, group_id)
  select cp.profile_id, 'group_post', p_actor, p_post, p_group
    from public.chat_participants cp
   where cp.conversation_id = p_group
     and cp.left_at is null
     and cp.muted = false
     and cp.profile_id <> p_actor
  returning *;
$$;

-- Service role only.
revoke execute on function public.feed_list_posts(uuid, uuid, boolean, boolean, timestamptz, uuid, int) from public, anon, authenticated;
revoke execute on function public.feed_list_comments(uuid, uuid, boolean, boolean, timestamptz, uuid, int) from public, anon, authenticated;
revoke execute on function public.feed_list_replies(uuid, uuid, boolean, boolean, timestamptz, uuid, int) from public, anon, authenticated;
revoke execute on function public.feed_notify_group_post(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.feed_comments_check_parent() from public, anon, authenticated;
revoke execute on function public.feed_likes_count() from public, anon, authenticated;
revoke execute on function public.feed_comments_count() from public, anon, authenticated;
grant execute on function public.feed_list_posts(uuid, uuid, boolean, boolean, timestamptz, uuid, int) to service_role;
grant execute on function public.feed_list_comments(uuid, uuid, boolean, boolean, timestamptz, uuid, int) to service_role;
grant execute on function public.feed_list_replies(uuid, uuid, boolean, boolean, timestamptz, uuid, int) to service_role;
grant execute on function public.feed_notify_group_post(uuid, uuid, uuid) to service_role;

-- ── Private media bucket ────────────────────────────────────
--   Separate from chat-attachments: feed photos are scoped to a feed
--   ("main/…" or "<groupId>/…"), not a conversation thread, and have their own
--   lifecycle. Limits enforced by Storage since signed upload URLs bypass the
--   service once issued.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feed-media', 'feed-media', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do nothing;
