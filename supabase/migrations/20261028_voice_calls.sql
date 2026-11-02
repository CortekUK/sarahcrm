-- ============================================================
-- 20261028_voice_calls.sql
--   AI Phone Receptionist (services/voice) — one row per inbound call to
--   The Club's Twilio number, written by the voice service with the
--   service-role key; read (and "Mark handled") by admins at /dashboard/calls.
--
--   1. voice_calls: call metadata, what the agent captured, the callback
--      request, escalation, AI summary + outcome, full transcript, links to
--      the enquiry it created and the member/contact the caller ID matched,
--      token usage, and handled_at/handled_by for the team.
--   2. voice_phone_digits(text): normalises a free-text phone number to
--      E.164 digits (no '+', UK default) — same rules as the voice service's
--      phone.ts and src/lib/whatsapp/client.ts normalizeE164.
--   3. voice_match_caller(text): finds the member (via profiles.phone) and/or
--      contact whose phone normalises to the caller's number. Service role
--      only.
--
-- SECURITY MODEL
--   • voice_calls: RLS ON. Admins may SELECT and UPDATE (mark handled) via
--     public.is_admin(). No client INSERT/DELETE — the voice service writes
--     with the service-role key (bypasses RLS).
--   • voice_match_caller is SECURITY DEFINER and EXECUTE is granted to
--     service_role only (it reads members/contacts/profiles).
--
-- Reuses the call-request columns on enquiries from
-- 20261016_concierge_events_calls.sql (call_requested_at / call_team /
-- call_preferences); apply that one first. The voice service tolerates it
-- being absent (it retries the enquiry insert without call_* columns).
--
-- Fully guarded — safe to run twice. NOT APPLIED by the build agent.
-- ============================================================

-- 1. voice_calls ─────────────────────────────────────────────
create table if not exists public.voice_calls (
  id                       uuid primary key default gen_random_uuid(),
  call_sid                 text not null unique,
  from_number              text,                         -- E.164 caller ID (may be 'anonymous')
  to_number                text,
  direction                text not null default 'inbound',
  status                   text not null default 'in_progress', -- ringing | in_progress | completed | busy | failed | no_answer | canceled
  started_at               timestamptz not null default now(),
  ended_at                 timestamptz,
  duration_s               integer,

  -- What the receptionist captured
  caller_name              text,
  caller_phone             text,                         -- confirmed/stated number (E.164 when parseable)
  caller_email             text,
  caller_company           text,
  caller_role              text,
  interest                 text,                         -- membership | event | private_event | sponsorship | concierge | press | other
  turnover_band            text,
  notes                    text,                         -- the message the caller left, in the agent's words

  -- Callback / booking request (never touches Google Calendar)
  callback_requested_at    timestamptz,                  -- when the caller asked for a call back
  callback_preferred_text  text,                         -- caller's own words, e.g. "Thursday after 2pm"
  callback_preferred_at    timestamptz,                  -- parsed ISO time when one was clear
  callback_team            text,                         -- sales | events | sarah
  callback_note            text,

  -- Escalation
  escalated                boolean not null default false,
  escalation_reason        text,

  -- Outcome
  summary                  text,
  outcome                  text,
  enquiry_id               uuid references public.enquiries(id) on delete set null,
  contact_id               uuid references public.contacts(id) on delete set null,
  member_id                uuid references public.members(id) on delete set null,
  transcript               jsonb not null default '[]'::jsonb, -- [{ role: caller|agent|event, text, at, interrupted? }]

  -- Cost / model
  model                    text,
  prompt_tokens            integer not null default 0,
  completion_tokens        integer not null default 0,
  llm_requests             integer not null default 0,
  error                    text,

  finalized_at             timestamptz,                  -- set once the summary/enquiry step has run
  handled_at               timestamptz,
  handled_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Columns added after the first draft (guarded so a partial earlier run is upgraded).
alter table public.voice_calls add column if not exists handled_at timestamptz;
alter table public.voice_calls add column if not exists handled_by uuid references public.profiles(id) on delete set null;
alter table public.voice_calls add column if not exists finalized_at timestamptz;
alter table public.voice_calls add column if not exists error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'voice_calls_outcome_check') then
    alter table public.voice_calls
      add constraint voice_calls_outcome_check
      check (outcome is null or outcome in
        ('message_taken', 'callback_requested', 'enquiry_created', 'escalated', 'no_action', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'voice_calls_callback_team_check') then
    alter table public.voice_calls
      add constraint voice_calls_callback_team_check
      check (callback_team is null or callback_team in ('sales', 'events', 'sarah'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'voice_calls_direction_check') then
    alter table public.voice_calls
      add constraint voice_calls_direction_check
      check (direction in ('inbound', 'outbound'));
  end if;
end $$;

create index if not exists idx_voice_calls_started_at on public.voice_calls(started_at desc, id desc);
create index if not exists idx_voice_calls_from_number on public.voice_calls(from_number);
create index if not exists idx_voice_calls_outcome on public.voice_calls(outcome, started_at desc);
create index if not exists idx_voice_calls_unhandled
  on public.voice_calls(started_at desc) where handled_at is null;

-- updated_at trigger (local function so this file has no dependency on
-- whichever generic trigger helper is live).
create or replace function public.voice_calls_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_voice_calls_updated_at on public.voice_calls;
create trigger trg_voice_calls_updated_at
  before update on public.voice_calls
  for each row execute function public.voice_calls_touch_updated_at();

alter table public.voice_calls enable row level security;

drop policy if exists "Admins read voice_calls" on public.voice_calls;
create policy "Admins read voice_calls"
  on public.voice_calls for select
  using (public.is_admin());

drop policy if exists "Admins update voice_calls" on public.voice_calls;
create policy "Admins update voice_calls"
  on public.voice_calls for update
  using (public.is_admin()) with check (public.is_admin());

-- 2. voice_phone_digits ──────────────────────────────────────
-- '+44 7915 919880' → '447915919880'; '07915 919880' → '447915919880';
-- '0044 7915…' → '447915…'; '7915 919880' → '447915919880' (bare national
-- digits get 44; 11+ bare digits are assumed to carry a country code).
-- Empty / no digits → null.
create or replace function public.voice_phone_digits(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    else (
      select case
        when d = '' then null
        when ltrim(p) like '+%' then d
        when d like '00%' then substr(d, 3)
        when d like '0%' then '44' || substr(d, 2)
        when d like '44%' or length(d) >= 11 then d
        else '44' || d
      end
      from (select regexp_replace(p, '\D', '', 'g') as d) s
    )
  end
$$;

-- Expression indexes so caller matching stays an index lookup.
create index if not exists idx_contacts_phone_digits
  on public.contacts (public.voice_phone_digits(phone)) where phone is not null;
create index if not exists idx_profiles_phone_digits
  on public.profiles (public.voice_phone_digits(phone)) where phone is not null;

-- 3. voice_match_caller ──────────────────────────────────────
-- Returns up to one member and one contact for a caller number.
create or replace function public.voice_match_caller(p_phone text)
returns table (kind text, id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = public
as $$
  with target as (select public.voice_phone_digits(p_phone) as d)
  (
    select 'member'::text, m.id, pr.first_name, pr.last_name
    from public.members m
    join public.profiles pr on pr.id = m.profile_id
    cross join target t
    where t.d is not null
      and length(t.d) >= 8
      and pr.phone is not null
      and public.voice_phone_digits(pr.phone) = t.d
      and m.deleted_at is null
    order by m.created_at desc
    limit 1
  )
  union all
  (
    select 'contact'::text, c.id, c.first_name, c.last_name
    from public.contacts c
    cross join target t
    where t.d is not null
      and length(t.d) >= 8
      and c.phone is not null
      and public.voice_phone_digits(c.phone) = t.d
    order by c.created_at desc
    limit 1
  )
$$;

revoke all on function public.voice_match_caller(text) from public;
revoke all on function public.voice_match_caller(text) from anon, authenticated;
grant execute on function public.voice_match_caller(text) to service_role;
