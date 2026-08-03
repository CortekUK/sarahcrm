-- Thread-level listing for the Inbox reader.
--
-- Thread grouping + correct thread-level pagination + per-viewer unread can't be
-- expressed cleanly in PostgREST, so it lives in a stable SQL function. It
-- returns ONE row per Gmail thread (the latest message's headers), restricted to
-- the caller's allowed mailboxes (passed in from the route AFTER access is
-- computed — the function trusts p_mailboxes), with an optional noise filter and
-- an optional ILIKE search, ordered newest-first, paginated by limit/offset.
--
-- `internal_date` is timestamptz (see 20260721_gmail_messages.sql), so the
-- RETURNS column is typed timestamptz to match.

create or replace function public.inbox_thread_list(
  p_mailboxes text[],
  p_include_noise boolean,
  p_query text,
  p_profile uuid,
  p_limit int,
  p_offset int
)
returns table (
  gmail_thread_id text,
  mailbox text,
  subject text,
  from_email text,
  snippet text,
  internal_date timestamptz,
  message_count bigint,
  unread boolean
)
language sql
stable
as $$
  with latest as (
    -- Latest message per thread within the allowed mailboxes + filters.
    select distinct on (m.gmail_thread_id)
      m.gmail_thread_id,
      m.mailbox,
      m.subject,
      m.from_email,
      m.snippet,
      m.internal_date
    from public.gmail_messages m
    where m.mailbox = any (p_mailboxes)
      and (p_include_noise or not coalesce(m.is_noise, false))
      and (
        p_query is null
        or btrim(p_query) = ''
        or m.subject ilike '%' || p_query || '%'
        or m.from_email ilike '%' || p_query || '%'
        or m.snippet ilike '%' || p_query || '%'
      )
    order by m.gmail_thread_id, m.internal_date desc
  ),
  counts as (
    -- Per-thread message count over the same mailbox + noise scope.
    select
      c.gmail_thread_id,
      count(*) as message_count
    from public.gmail_messages c
    where c.mailbox = any (p_mailboxes)
      and (p_include_noise or not coalesce(c.is_noise, false))
    group by c.gmail_thread_id
  )
  select
    t.gmail_thread_id,
    t.mailbox,
    t.subject,
    t.from_email,
    t.snippet,
    t.internal_date,
    coalesce(cnt.message_count, 1) as message_count,
    not exists (
      select 1
      from public.inbox_read_state r
      where r.profile_id = p_profile
        and r.gmail_thread_id = t.gmail_thread_id
        and r.read_at >= t.internal_date
    ) as unread
  from latest t
  left join counts cnt on cnt.gmail_thread_id = t.gmail_thread_id
  order by t.internal_date desc
  limit p_limit
  offset p_offset;
$$;

grant execute on function public.inbox_thread_list(text[], boolean, text, uuid, int, int)
  to authenticated, service_role;
