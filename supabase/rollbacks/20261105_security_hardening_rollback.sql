-- ============================================================
-- ROLLBACK for supabase/migrations/20261105_security_hardening.sql
--   Puts every rule back exactly as it was on production on 2026-11-04
--   (policies, grants and function bodies copied from the live database
--   before the migration was written).
--
--   Kept outside supabase/migrations/ on purpose so no migration run picks
--   it up. Run it by hand in the SQL editor only if the migration breaks
--   something. Safe to run twice. Touches no rows.
--
--   Left in place (harmless, and already true on production before):
--   section 12's schema catch-up (content bucket, bookings.member_id
--   nullable, admin policies that already existed), and the
--   bookings_event_status_idx index (speed only).
-- ============================================================

-- ── Triggers ────────────────────────────────────────────────
drop trigger if exists profiles_guard_self_update on public.profiles;
drop trigger if exists members_guard_self_update on public.members;
drop trigger if exists bookings_guard_insert on public.bookings;
drop trigger if exists bookings_guard_checkin on public.bookings;
drop trigger if exists events_guard_delete on public.events;
drop trigger if exists reward_claims_guard_insert on public.reward_claims;
drop trigger if exists reward_offers_guard_delete on public.reward_offers;
drop trigger if exists reward_partners_guard_delete on public.reward_partners;
drop trigger if exists concierge_requests_guard_insert on public.concierge_requests;
drop trigger if exists reviews_guard_insert on public.reviews;
drop trigger if exists mailing_list_normalise on public.mailing_list;
drop trigger if exists accountability_tasks_guard_staff_update on public.accountability_tasks;
drop trigger if exists time_entries_guard_staff on public.time_entries;
drop trigger if exists daily_handovers_guard_staff on public.daily_handovers;

drop function if exists public.profiles_guard_self_update();
drop function if exists public.members_guard_self_update();
drop function if exists public.bookings_guard_insert();
drop function if exists public.bookings_guard_checkin();
drop function if exists public.events_guard_delete();
drop function if exists public.reward_claims_guard_insert();
drop function if exists public.reward_offers_guard_delete();
drop function if exists public.reward_partners_guard_delete();
drop function if exists public.concierge_requests_guard_insert();
drop function if exists public.reviews_guard_insert();
drop function if exists public.mailing_list_normalise();
drop function if exists public.accountability_tasks_guard_staff_update();
drop function if exists public.time_entries_guard_staff();
drop function if exists public.daily_handovers_guard_staff();

-- ── Constraints and indexes ─────────────────────────────────
alter table public.events drop constraint if exists events_dates_order_check;
alter table public.events drop constraint if exists events_guest_capacity_check;
alter table public.events drop constraint if exists events_non_negative_check;
alter table public.events drop constraint if exists events_slug_format_check;
alter table public.events drop constraint if exists events_title_present_check;
alter table public.time_entries drop constraint if exists time_entries_hours_range_check;
alter table public.time_entries drop constraint if exists time_entries_timer_order_check;
drop index if exists public.mailing_list_email_lower_key;
drop index if exists public.introductions_one_in_flight_per_pair;

-- ── Original function bodies ────────────────────────────────
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('team_member', 'freelancer')
  );
$$;

create or replace function public.scorecard_targets_guard_columns()
returns trigger
language plpgsql
as $$
begin
  -- Admins may change anything.
  if public.is_admin() then
    return new;
  end if;
  -- Non-admins (staff) may only ever touch manual_actual on a manual target.
  -- Force every other column back to its stored value so nothing else can
  -- change even if a policy WITH CHECK would have allowed the row through.
  new.id           := old.id;
  new.staff_id     := old.staff_id;
  new.week_start   := old.week_start;
  new.label        := old.label;
  new.target_value := old.target_value;
  new.source       := old.source;
  new.created_by   := old.created_by;
  new.created_at   := old.created_at;
  -- manual_actual only makes sense for manual targets.
  if old.source <> 'manual' then
    new.manual_actual := old.manual_actual;
  end if;
  return new;
end;
$$;

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

-- ── Original policies ───────────────────────────────────────
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
  on public.profiles for select
  using (true);

drop policy if exists "Authenticated users can view members" on public.members;
create policy "Authenticated users can view members"
  on public.members for select
  using (deleted_at is null);

drop policy if exists "Authenticated users can view member_tags" on public.member_tags;
create policy "Authenticated users can view member_tags"
  on public.member_tags for select
  using (true);

drop policy if exists "Public read gallery_photos" on public.gallery_photos;
create policy "Public read gallery_photos"
  on public.gallery_photos for select
  using (true);

drop policy if exists "Members can view own introductions" on public.introductions;
create policy "Members can view own introductions"
  on public.introductions for select
  using (
    exists (
      select 1 from public.members
      where members.profile_id = auth.uid()
        and (members.id = introductions.member_a_id or members.id = introductions.member_b_id)
    )
  );

drop policy if exists "Members update own reward_claims" on public.reward_claims;
create policy "Members update own reward_claims"
  on public.reward_claims for update
  using (
    exists (
      select 1 from public.members
      where members.id = reward_claims.member_id
        and members.profile_id = auth.uid()
    )
  );

drop policy if exists "Public insert enquiries" on public.enquiries;
create policy "Public insert enquiries"
  on public.enquiries for insert
  with check (true);
drop policy if exists "Public can submit enquiries" on public.enquiries;
create policy "Public can submit enquiries"
  on public.enquiries for insert
  with check (true);

drop policy if exists "Public insert membership_applications" on public.membership_applications;
create policy "Public insert membership_applications"
  on public.membership_applications for insert
  with check (true);
drop policy if exists "Public can submit membership applications" on public.membership_applications;
create policy "Public can submit membership applications"
  on public.membership_applications for insert
  with check (true);

drop policy if exists "Public insert reviews" on public.reviews;
create policy "Public insert reviews"
  on public.reviews for insert
  with check (status = 'pending' and is_active = true);

drop policy if exists "Admins read automation_log" on public.automation_log;

-- ── Original grants (visitors had full column access) ───────
grant select on public.reviews to anon;
grant select on public.reward_partners to anon;

-- ── Original storage policies ───────────────────────────────
drop policy if exists "Public insert applicant photos" on storage.objects;
create policy "Public insert applicant photos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'content' and (storage.foldername(name))[1] = 'applicants');

drop policy if exists "Public read content" on storage.objects;
create policy "Public read content"
  on storage.objects for select
  using (bucket_id = 'content');

drop policy if exists "Public read applicant photos" on storage.objects;
create policy "Public read applicant photos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'content' and (storage.foldername(name))[1] = 'applicants');

-- ── Helpers (last: nothing above depends on them any more) ──
drop function if exists public.is_privileged_writer();
drop function if exists public.is_service_request();
