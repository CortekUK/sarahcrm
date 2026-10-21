-- ============================================================
-- 20261022_feed_mentions.sql
--   @mentions in Member Feed posts, comments and replies.
--   Bodies store tokens `@[Display Name](profile-uuid)`; the chat service
--   validates each id and persists the kept ones in `mentions`. A new
--   notification kind 'mention'. Group-post fan-out can skip people who get a
--   'mention' for the same post (one notification per person).
--
--   Depends on 20261022_member_feed.sql. Service role only, as before.
--   Fully guarded — safe to run twice.
-- ============================================================

alter table public.feed_posts    add column if not exists mentions uuid[] not null default '{}';
alter table public.feed_comments add column if not exists mentions uuid[] not null default '{}';

-- Notification kinds + 'mention'.
alter table public.member_notifications drop constraint if exists member_notifications_kind_check;
alter table public.member_notifications
  add constraint member_notifications_kind_check
  check (kind in ('comment','reply','group_post','mention'));

-- Group-post fan-out gains p_exclude (people mentioned in the post get a
-- 'mention' instead). Replaces the 3-arg signature; the 4th arg defaults to
-- '{}' so the old call shape still works.
drop function if exists public.feed_notify_group_post(uuid, uuid, uuid);

create or replace function public.feed_notify_group_post(
  p_post    uuid,
  p_group   uuid,
  p_actor   uuid,
  p_exclude uuid[] default '{}'
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
     and not (cp.profile_id = any (coalesce(p_exclude, '{}')))
  returning *;
$$;

revoke execute on function public.feed_notify_group_post(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.feed_notify_group_post(uuid, uuid, uuid, uuid[]) to service_role;

-- Re-create the keyset readers (bodies unchanged) so their `setof` row type
-- is re-checked against the tables now that they carry `mentions`.
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

revoke execute on function public.feed_list_posts(uuid, uuid, boolean, boolean, timestamptz, uuid, int) from public, anon, authenticated;
revoke execute on function public.feed_list_comments(uuid, uuid, boolean, boolean, timestamptz, uuid, int) from public, anon, authenticated;
revoke execute on function public.feed_list_replies(uuid, uuid, boolean, boolean, timestamptz, uuid, int) from public, anon, authenticated;
grant execute on function public.feed_list_posts(uuid, uuid, boolean, boolean, timestamptz, uuid, int) to service_role;
grant execute on function public.feed_list_comments(uuid, uuid, boolean, boolean, timestamptz, uuid, int) to service_role;
grant execute on function public.feed_list_replies(uuid, uuid, boolean, boolean, timestamptz, uuid, int) to service_role;
