-- Event planning import (Master Events Plan spreadsheet)
--
-- Sarah plans the year in a spreadsheet whose cells are prose, not data:
-- "April /May" for a date, "15 - 20" for capacity, a shortlist of five venues,
-- "Complimentary Members / £100 + VAT Guests" for pricing. None of it can be
-- coerced into the bookable columns without guessing, so the importer stores
-- each row VERBATIM in planning_data and creates the event in a new
-- 'planning' status. An admin then opens the event, picks the real values,
-- and only then can it be published.
--
--   planning  →  imported from the sheet, admin-only, not bookable
--   draft     →  unchanged meaning: written by hand, not yet published
--
-- Existing RLS already hides anything outside ('published','live','completed')
-- from non-admins, so 'planning' is invisible to members and the public with
-- no policy change.

-- 1. New status ─────────────────────────────────────────────────────────
-- Must be its own statement: a new enum label cannot be used by later
-- statements in the same transaction.
alter type public.event_status add value if not exists 'planning';

-- 2. Planning columns ───────────────────────────────────────────────────
alter table public.events
  -- The spreadsheet row exactly as written, including the columns we have no
  -- field for (Purpose, Target Audience, Sponsorship, Commercial Notes) plus
  -- the raw Venue shortlist / date text / ticket wording. Shown beside each
  -- input so the admin can transcribe from it. Never parsed.
  add column if not exists planning_data jsonb,
  -- 'import' marks a row created by the spreadsheet importer. Null = hand-made.
  add column if not exists import_source text,
  add column if not exists imported_at timestamptz;

-- Planning events have no date yet ("Q4 2026 or Q1 2027 (TBC)"), so start_date
-- can no longer be NOT NULL. The trigger below re-imposes it at publish time,
-- which is the only moment it actually matters.
alter table public.events alter column start_date drop not null;

create index if not exists events_status_idx on public.events (status);

-- 3. Publish gate ───────────────────────────────────────────────────────
-- The admin UI shows this as a checklist, but the rule is enforced here too:
-- a half-finished plan must never reach the public site, whatever calls the
-- database. Planning and draft rows may be saved incomplete all day long.
create or replace function public.check_event_publishable()
returns trigger
language plpgsql
as $$
declare
  missing text[] := '{}';
begin
  if new.status in ('planning', 'draft', 'cancelled') then
    return new;
  end if;

  -- Only the MOMENT of publishing is gated. An event that is already live can
  -- still be edited freely, so this can't strand a published event that
  -- predates these rules (some have no description or capacity set).
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  if new.start_date is null then
    missing := missing || 'a start date';
  end if;
  if coalesce(trim(new.venue_name), '') = '' then
    missing := missing || 'a venue';
  end if;
  if coalesce(new.capacity, 0) <= 0 then
    missing := missing || 'a capacity';
  end if;
  if coalesce(trim(new.description), '') = '' then
    missing := missing || 'a description';
  end if;

  if array_length(missing, 1) > 0 then
    raise exception 'This event still needs % before it can be published.',
      array_to_string(missing, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists events_publishable on public.events;
create trigger events_publishable
  before insert or update on public.events
  for each row execute function public.check_event_publishable();
