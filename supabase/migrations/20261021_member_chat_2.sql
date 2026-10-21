-- ============================================================
-- 20261021_member_chat_2.sql
--   chat_people gains `p_exclude_dm` (GET /people?excludeDm=1) so the
--   WhatsApp-style "Start a conversation" list can page reliably while
--   leaving out people the viewer already has a (non-empty) DM with.
--
--   Replaces the 7-arg signature from 20261021_member_chat.sql with an
--   8-arg one (last arg defaults to false, so old callers keep working).
--   EXECUTE stays service_role only. Fully guarded — safe to run twice.
-- ============================================================

drop function if exists public.chat_people(uuid, boolean, text, boolean, text, uuid, int);

create or replace function public.chat_people(
  p_viewer     uuid,
  p_all        boolean,
  p_q          text,
  p_has_cursor boolean,
  p_after_name text,
  p_after_id   uuid,
  p_limit      int,
  p_exclude_dm boolean default false
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
       -- excludeDm: hide people I already have a DM WITH MESSAGES with (they
       -- show in the conversation list). Empty DMs don't count, so the person
       -- stays reachable from "Start a conversation".
       and (not p_exclude_dm or not exists (
             select 1
               from public.chat_conversations c
               join public.chat_participants mp
                 on mp.conversation_id = c.id and mp.profile_id = p_viewer and mp.left_at is null
               join public.chat_participants op
                 on op.conversation_id = c.id and op.profile_id = pr.id and op.left_at is null
              where c.kind = 'dm'
                and exists (select 1 from public.chat_messages cm where cm.conversation_id = c.id)))
  )
  select * from people pe
   where (p_q is null
          or (coalesce(pe.first_name, '') || ' ' || coalesce(pe.last_name, '')) ilike '%' || p_q || '%'
          or pe.company_name ilike '%' || p_q || '%')
     and (not p_has_cursor or (pe.sort_name, pe.id) > (p_after_name, p_after_id))
   order by pe.sort_name, pe.id
   limit greatest(1, least(p_limit, 100));
$$;

revoke execute on function public.chat_people(uuid, boolean, text, boolean, text, uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.chat_people(uuid, boolean, text, boolean, text, uuid, int, boolean) to service_role;
