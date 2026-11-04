-- ============================================================
-- 20261105_security_hardening.sql
--   Database-side fixes for the QA tracker's security findings
--   (tickets #5 #6 #10 #14 #20 #36 #37 #38 #39 #40 #41 #44 #45 #46 #48
--   #52 #55 #57). Every rule here was checked against the live policies
--   on 2026-11-04.
--
-- APPROACH
--   The portal still writes some tables straight from the browser
--   (profile edit, complimentary booking, reward claim, concierge request,
--   staff time/handover). Instead of removing those policies (which would
--   break the screens), BEFORE triggers pin what a non-admin may write.
--   Admin browser sessions (is_admin()) and server routes using the
--   service-role key are never restricted by the column guards.
--
--   Errors raised for the app to map start with an upper-case token
--   (DUPLICATE_BOOKING, EVENT_FULL, CHECKIN_NOT_CONFIRMED, …).
--
-- NOT covered here (need frontend changes, see the QA report):
--   * other members' private columns (members.notes, stripe ids, scores…)
--     are still readable by signed-in members — needs a directory view;
--   * the other member's private note on an introduction;
--   * reward discount codes before claiming.
--
-- Fully guarded — safe to run twice. No existing rows are modified.
-- ============================================================

-- ── Helpers ─────────────────────────────────────────────────
-- True for server routes (service-role key) and direct SQL (no JWT at all).
-- Deliberately uses auth.role(), not current_user: inside SECURITY DEFINER
-- trigger functions current_user is the owner, never the caller.
create or replace function public.is_service_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), 'service_role') = 'service_role'
$$;

create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_service_request() or public.is_admin()
$$;

-- Inactive staff lose staff access (#55: "inactive" did not lock anyone out).
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
      and staff_status = 'active'
  );
$$;

-- ── 1. Signed-out reads (#5 #37 #52 #45 #38 #57) ─────────────
-- These policies were named "Authenticated users …" but applied to every
-- role, so the public anon key read all profiles and member records.
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Authenticated users can view members" on public.members;
create policy "Authenticated users can view members"
  on public.members for select to authenticated
  using (deleted_at is null);

drop policy if exists "Authenticated users can view member_tags" on public.member_tags;
create policy "Authenticated users can view member_tags"
  on public.member_tags for select to authenticated
  using (true);

-- Reviews: visitors may read only the display columns of approved reviews
-- (email, surname-only use, admin notes stay private). The public /reviews
-- page selects exactly these columns.
revoke select on public.reviews from anon;
grant select (id, first_name, last_name, company, title, body, event_id,
              status, is_active, approved_at, created_at)
  on public.reviews to anon;

-- Reward partners: visitors never see the private contact details.
revoke select on public.reward_partners from anon;
grant select (id, name, category, description, logo_url, website_url,
              is_active, is_public, display_order, created_at, updated_at)
  on public.reward_partners to anon;

-- Photos of unpublished galleries were readable by anyone (policy "true");
-- the published-gallery policy alongside it stays.
drop policy if exists "Public read gallery_photos" on public.gallery_photos;

-- ── 2. Self-edit protection (#6 #40) ─────────────────────────
-- A member could PATCH their own row to role = 'admin', or set their own
-- tier, status, quota and billing fields. Non-privileged writers may now
-- change only the fields the portal's profile form edits.
create or replace function public.profiles_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editable text[] := array['first_name', 'last_name', 'phone', 'avatar_url',
    'company_name', 'job_title', 'bio', 'linkedin_url', 'website_url',
    'updated_at'];
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'PROFILE_FIELD_LOCKED: only your own profile details can be changed here.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function public.profiles_guard_self_update();

create or replace function public.members_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editable text[] := array['company_name', 'company_description',
    'company_website', 'sector', 'sub_sector', 'employee_count',
    'annual_turnover', 'intro_target_types', 'intro_target_criteria',
    'dream_introductions', 'what_they_can_offer', 'business_objectives',
    'budgets', 'partner_name', 'assistant_name', 'dietary_requirements',
    'updated_at'];
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'MEMBER_FIELD_LOCKED: membership, billing and quota fields are managed by The Club.';
  end if;
  return new;
end;
$$;

drop trigger if exists members_guard_self_update on public.members;
create trigger members_guard_self_update
  before update on public.members
  for each row execute function public.members_guard_self_update();

-- ── 3. Bookings (#10 #14 #36 #41) ────────────────────────────
-- Every non-admin insert (member browser AND server routes) is serialised
-- per event, refused when the member/guest already holds an active booking,
-- and refused when it would oversell capacity. Bookings written from a
-- member's browser (the complimentary path) must also be genuinely free,
-- for a bookable future event, by an active member.
create or replace function public.bookings_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events%rowtype;
  seats_taken integer;
begin
  if public.is_admin() or new.status not in ('confirmed', 'pending') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking:' || new.event_id::text, 0));

  if new.member_id is not null and exists (
    select 1 from public.bookings b
    where b.event_id = new.event_id
      and b.member_id = new.member_id
      and b.status in ('confirmed', 'pending')
  ) then
    raise exception 'DUPLICATE_BOOKING: this member already has a booking for this event.';
  end if;

  if new.member_id is null and nullif(trim(new.guest_email), '') is not null and exists (
    select 1 from public.bookings b
    where b.event_id = new.event_id
      and b.member_id is null
      and lower(trim(b.guest_email)) = lower(trim(new.guest_email))
      and b.status in ('confirmed', 'pending')
  ) then
    raise exception 'DUPLICATE_BOOKING: there is already a booking for this email address.';
  end if;

  select * into ev from public.events where id = new.event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND: this event does not exist.';
  end if;

  if ev.capacity is not null then
    select coalesce(sum(1 + coalesce(b.guests_invited, 0)), 0) into seats_taken
    from public.bookings b
    where b.event_id = new.event_id
      and b.status in ('confirmed', 'pending');
    if seats_taken + 1 + coalesce(new.guests_invited, 0) > ev.capacity then
      raise exception 'EVENT_FULL: this event is fully booked.';
    end if;
  end if;

  -- Member browser (portal complimentary path) only from here on.
  if public.is_service_request() then
    return new;
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = new.member_id
      and m.profile_id = auth.uid()
      and m.membership_status = 'active'
      and m.deleted_at is null
  ) then
    raise exception 'BOOKING_NOT_ALLOWED: only active members can book.';
  end if;

  if ev.status not in ('published', 'live')
     or ev.start_date is null
     or ev.start_date <= now() then
    raise exception 'BOOKING_NOT_ALLOWED: this event is not open for booking.';
  end if;

  if ev.member_price_pence <> 0 and not exists (
    select 1 from public.sponsorships s
    where s.event_id = new.event_id
      and s.member_id = new.member_id
      and s.status not in ('declined', 'cancelled')
  ) then
    raise exception 'BOOKING_NOT_ALLOWED: paid events must be booked through checkout.';
  end if;

  if new.amount_pence <> 0
     or new.is_guest
     or coalesce(new.guests_invited, 0) <> 0
     or new.checked_in
     or new.attendance is not null
     or new.stripe_payment_intent_id is not null
     or new.stripe_customer_id is not null
     or new.stripe_payment_method_id is not null
     or new.stripe_setup_intent_id is not null
     or new.sponsorship_id is not null
     or new.status <> (case when ev.auto_confirm then 'confirmed' else 'pending' end)::public.booking_status
  then
    raise exception 'BOOKING_NOT_ALLOWED: complimentary bookings cannot set payment or check-in fields.';
  end if;

  return new;
end;
$$;

-- Serves the trigger's seat count and the abandoned-checkout release.
create index if not exists bookings_event_status_idx
  on public.bookings (event_id, status);

drop trigger if exists bookings_guard_insert on public.bookings;
create trigger bookings_guard_insert
  before insert on public.bookings
  for each row execute function public.bookings_guard_insert();

-- Door check-in: only confirmed bookings can be marked as checked in
-- (QA checked in a cancelled and an unpaid booking).
create or replace function public.bookings_guard_checkin()
returns trigger
language plpgsql
as $$
begin
  if new.checked_in and not coalesce(old.checked_in, false)
     and new.status <> 'confirmed' then
    raise exception 'CHECKIN_NOT_CONFIRMED: only confirmed bookings can be checked in (this one is %).', new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_guard_checkin on public.bookings;
create trigger bookings_guard_checkin
  before update of checked_in on public.bookings
  for each row execute function public.bookings_guard_checkin();

-- ── 4. Events (#41) ──────────────────────────────────────────
-- Deleting an event cascaded away its paid bookings, leaving payments that
-- point at nothing. Events with paid bookings must be cancelled instead.
create or replace function public.events_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.bookings b
    where b.event_id = old.id
      and b.amount_pence > 0
      and b.status in ('confirmed', 'refunded')
  ) or exists (
    select 1 from public.payments p
    join public.bookings b on b.id = p.reference_id
    where p.payment_type = 'event_booking'
      and b.event_id = old.id
  ) then
    raise exception 'EVENT_HAS_PAYMENTS: this event has paid bookings — cancel it instead of deleting it.';
  end if;
  return old;
end;
$$;

drop trigger if exists events_guard_delete on public.events;
create trigger events_guard_delete
  before delete on public.events
  for each row execute function public.events_guard_delete();

-- The publish check crashed with "malformed array literal" instead of
-- listing what's missing: `text[] || 'unknown literal'` parses the literal
-- as an array. Same rules, array_append instead.
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
    missing := array_append(missing, 'a start date');
  end if;
  if coalesce(trim(new.venue_name), '') = '' then
    missing := array_append(missing, 'a venue');
  end if;
  if coalesce(new.capacity, 0) <= 0 then
    missing := array_append(missing, 'a capacity');
  end if;
  if coalesce(trim(new.description), '') = '' then
    missing := array_append(missing, 'a description');
  end if;

  if array_length(missing, 1) > 0 then
    raise exception 'This event still needs % before it can be published.',
      array_to_string(missing, ', ');
  end if;

  return new;
end;
$$;

-- Basic sanity the form didn't enforce. NOT VALID: existing rows are left
-- alone (all live rows pass today), new writes are checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_dates_order_check') then
    alter table public.events add constraint events_dates_order_check
      check (end_date is null or start_date is null or end_date >= start_date) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_guest_capacity_check') then
    alter table public.events add constraint events_guest_capacity_check
      check (guest_ticket_capacity is null or capacity is null or guest_ticket_capacity <= capacity) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_non_negative_check') then
    alter table public.events add constraint events_non_negative_check
      check (member_price_pence >= 0 and guest_price_pence >= 0 and sponsor_price_pence >= 0
             and coalesce(capacity, 0) >= 0 and coalesce(guest_ticket_capacity, 0) >= 0
             and coalesce(accommodation_price_pence, 0) >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_slug_format_check') then
    alter table public.events add constraint events_slug_format_check
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_title_present_check') then
    alter table public.events add constraint events_title_present_check
      check (length(trim(title)) between 1 and 300) not valid;
  end if;
end $$;

-- ── 5. Introductions (#20) ───────────────────────────────────
-- Members saw introductions The Club had not sent yet (pending requests
-- aimed at them, dismissed suggestions). Each side now sees a row only once
-- its own email has gone out — or, for the requester, their own request.
drop policy if exists "Members can view own introductions" on public.introductions;
create policy "Members can view own introductions"
  on public.introductions for select to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.profile_id = auth.uid()
        and (
          (m.id = introductions.member_a_id
            and (introductions.email_a_sent_at is not null
                 or introductions.requested_by = m.id
                 or introductions.requested_by = auth.uid()))
          or
          (m.id = introductions.member_b_id
            and introductions.email_b_sent_at is not null)
        )
    )
  );

-- One in-flight introduction per pair, whichever way round (#27 #37: the
-- manual Create path and simultaneous requests made duplicates). Live data
-- has no such duplicates today. Routes map 23505 to "already in progress".
create unique index if not exists introductions_one_in_flight_per_pair
  on public.introductions (least(member_a_id, member_b_id), greatest(member_a_id, member_b_id))
  where status in ('suggested', 'approved', 'scheduled', 'sent', 'accepted');

-- ── 6. Reward claims (#38) ───────────────────────────────────
-- Members could create claims already 'redeemed' with any value, edit them
-- afterwards, claim the same offer repeatedly, and claim expired/hidden
-- offers or while cancelled. Members may now only create a plain 'claimed'
-- row for a live offer, once; everything else is admin-only.
create or replace function public.reward_claims_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  new.status := 'claimed';
  new.value_pence := null;
  new.notes := null;
  new.redeemed_at := null;
  new.claimed_at := now();

  if not exists (
    select 1 from public.members m
    where m.id = new.member_id
      and m.profile_id = auth.uid()
      and m.membership_status = 'active'
      and m.deleted_at is null
  ) then
    raise exception 'CLAIM_NOT_ALLOWED: only active members can claim rewards.';
  end if;

  if not exists (
    select 1 from public.reward_offers o
    join public.reward_partners p on p.id = o.partner_id
    where o.id = new.offer_id
      and o.is_active
      and p.is_active
      and (o.valid_until is null or o.valid_until >= (now() at time zone 'Europe/London')::date)
  ) then
    raise exception 'CLAIM_NOT_ALLOWED: this offer is no longer available.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('claim:' || new.member_id::text || ':' || new.offer_id::text, 0));
  if exists (
    select 1 from public.reward_claims c
    where c.member_id = new.member_id
      and c.offer_id = new.offer_id
      and c.status <> 'cancelled'
  ) then
    raise exception 'DUPLICATE_CLAIM: you have already claimed this offer.';
  end if;

  return new;
end;
$$;

drop trigger if exists reward_claims_guard_insert on public.reward_claims;
create trigger reward_claims_guard_insert
  before insert on public.reward_claims
  for each row execute function public.reward_claims_guard_insert();

-- The portal never updates claims; the policy only enabled self-redeeming.
drop policy if exists "Members update own reward_claims" on public.reward_claims;

-- Deleting an offer or partner cascaded away every member's claim history.
create or replace function public.reward_offers_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.reward_claims c where c.offer_id = old.id) then
    raise exception 'OFFER_HAS_CLAIMS: members have claimed this offer — switch it off instead of deleting it.';
  end if;
  return old;
end;
$$;

drop trigger if exists reward_offers_guard_delete on public.reward_offers;
create trigger reward_offers_guard_delete
  before delete on public.reward_offers
  for each row execute function public.reward_offers_guard_delete();

create or replace function public.reward_partners_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.reward_claims c
    join public.reward_offers o on o.id = c.offer_id
    where o.partner_id = old.id
  ) then
    raise exception 'PARTNER_HAS_CLAIMS: members have claimed this partner''s offers — switch it off instead of deleting it.';
  end if;
  return old;
end;
$$;

drop trigger if exists reward_partners_guard_delete on public.reward_partners;
create trigger reward_partners_guard_delete
  before delete on public.reward_partners
  for each row execute function public.reward_partners_guard_delete();

-- ── 7. Concierge requests (#39) ──────────────────────────────
-- Members could create requests with staff-only fields (quote, sale price,
-- commission, status 'delivered', Xero invoice id…). A member's insert is
-- now reduced to their brief; staff fields are cleared, the request starts
-- 'pending', inputs are bounded, cancelled members are refused and bursts
-- are capped.
create or replace function public.concierge_requests_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = new.member_id
      and m.profile_id = auth.uid()
      and m.membership_status = 'active'
      and m.deleted_at is null
  ) then
    raise exception 'REQUEST_NOT_ALLOWED: only active members can send concierge requests.';
  end if;

  new.status := 'pending';
  new.quoted_amount_pence := null;
  new.fulfilled_by := null;
  new.notes := null;
  new.assigned_to := null;
  new.supplier_name := null;
  new.supplier_cost_pence := null;
  new.sale_price_pence := null;
  new.commission_pence := null;
  new.priority := null;
  new.delivered_at := null;
  new.feedback_note := null;
  new.feedback_rating := null;
  new.commission_status := 'pending';
  new.commission_paid_at := null;
  new.xero_invoice_id := null;

  if new.request_type not in ('Travel', 'Holidays', 'Private Events',
      'Luxury Goods', 'Fashion', 'Sports & Events Tickets', 'Private Aviation',
      'Transfers', 'Private Lounges', 'Venue Finding', 'Other') then
    raise exception 'REQUEST_INVALID: unknown request type.';
  end if;
  if length(trim(coalesce(new.description, ''))) = 0 then
    raise exception 'REQUEST_INVALID: please describe your request.';
  end if;
  if length(new.description) > 5000
     or length(coalesce(new.event_name, '')) > 300
     or length(coalesce(new.location, '')) > 300
     or length(coalesce(new.dates, '')) > 300 then
    raise exception 'REQUEST_INVALID: the request is too long.';
  end if;
  if new.guests is not null and (new.guests < 1 or new.guests > 1000) then
    raise exception 'REQUEST_INVALID: number of guests must be between 1 and 1,000.';
  end if;
  if new.budget_pence is not null and (new.budget_pence < 0 or new.budget_pence > 1000000000) then
    raise exception 'REQUEST_INVALID: budget is out of range.';
  end if;

  if (
    select count(*) from public.concierge_requests r
    where r.member_id = new.member_id
      and r.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'REQUEST_RATE_LIMITED: too many requests in the last hour — please try again later.';
  end if;

  return new;
end;
$$;

drop trigger if exists concierge_requests_guard_insert on public.concierge_requests;
create trigger concierge_requests_guard_insert
  before insert on public.concierge_requests
  for each row execute function public.concierge_requests_guard_insert();

-- ── 8. Public inserts (#44 #36 #45 #46) ──────────────────────
-- Enquiries and membership applications are written only by server routes
-- (service role). The public insert policies let anyone bypass the intake
-- (enquiry with lead_score 100 / status 'won'; junk applications).
drop policy if exists "Public insert enquiries" on public.enquiries;
drop policy if exists "Public can submit enquiries" on public.enquiries;
drop policy if exists "Public insert membership_applications" on public.membership_applications;
drop policy if exists "Public can submit membership applications" on public.membership_applications;

-- Reviews: the weaker duplicate insert policy let visitors pre-fill
-- approved_at / reviewed_at / admin_notes. reviews_public_insert (which
-- requires those to be null) stays. Plus input bounds the form had but the
-- database didn't.
drop policy if exists "Public insert reviews" on public.reviews;

create or replace function public.reviews_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  new.email := lower(trim(new.email));
  if length(trim(coalesce(new.first_name, ''))) = 0
     or length(trim(coalesce(new.last_name, ''))) = 0
     or length(new.first_name) > 100 or length(new.last_name) > 100
     or length(coalesce(new.company, '')) > 200 or length(coalesce(new.title, '')) > 200 then
    raise exception 'REVIEW_INVALID: please check your name, company and title.';
  end if;
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(new.email) > 254 then
    raise exception 'REVIEW_INVALID: please enter a valid email address.';
  end if;
  if length(trim(coalesce(new.body, ''))) < 80 or length(new.body) > 5000 then
    raise exception 'REVIEW_INVALID: reviews must be between 80 and 5,000 characters.';
  end if;
  if new.event_id is not null and not exists (
    select 1 from public.events e
    where e.id = new.event_id and e.status in ('published', 'live', 'completed')
  ) then
    raise exception 'REVIEW_INVALID: unknown event.';
  end if;
  if (
    select count(*) from public.reviews r
    where r.email = new.email and r.created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'REVIEW_RATE_LIMITED: thank you — we already have your reviews for today.';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_guard_insert on public.reviews;
create trigger reviews_guard_insert
  before insert on public.reviews
  for each row execute function public.reviews_guard_insert();

-- Newsletter: one subscriber per address regardless of case, valid emails
-- only (#46). Existing rows have no case-duplicates today.
create or replace function public.mailing_list_normalise()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(new.email) > 254 then
    raise exception 'SUBSCRIBER_INVALID: please enter a valid email address.';
  end if;
  if length(coalesce(new.first_name, '')) > 100 or length(coalesce(new.last_name, '')) > 100 then
    raise exception 'SUBSCRIBER_INVALID: name is too long.';
  end if;
  return new;
end;
$$;

drop trigger if exists mailing_list_normalise on public.mailing_list;
create trigger mailing_list_normalise
  before insert or update of email, first_name, last_name on public.mailing_list
  for each row execute function public.mailing_list_normalise();

create unique index if not exists mailing_list_email_lower_key
  on public.mailing_list (lower(email));

-- ── 9. Staff portal (#55) ────────────────────────────────────
-- Staff could rename their tasks and push deadlines (overdue work vanished
-- from Overview). Staff may now change only status and outcome.
create or replace function public.accountability_tasks_guard_staff_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editable text[] := array['status', 'outcome', 'updated_at'];
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'TASK_FIELD_LOCKED: only the status and outcome of your task can be changed.';
  end if;
  if length(coalesce(new.outcome, '')) > 5000 then
    raise exception 'TASK_INVALID: the outcome is too long (5,000 characters max).';
  end if;
  return new;
end;
$$;

drop trigger if exists accountability_tasks_guard_staff_update on public.accountability_tasks;
create trigger accountability_tasks_guard_staff_update
  before update on public.accountability_tasks
  for each row execute function public.accountability_tasks_guard_staff_update();

-- Time entries: no impossible hours (30 h, −5 h), no timers ending before
-- they start, and staff can log only the last 14 days, at most 24 h a day.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'time_entries_hours_range_check') then
    alter table public.time_entries add constraint time_entries_hours_range_check
      check (hours is null or (hours >= 0 and hours <= 24)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'time_entries_timer_order_check') then
    alter table public.time_entries add constraint time_entries_timer_order_check
      check (ended_at is null or started_at is null or ended_at >= started_at) not valid;
  end if;
end $$;

create or replace function public.time_entries_guard_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  day_total numeric;
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if new.entry_date > today or new.entry_date < today - 14 then
    raise exception 'TIME_INVALID: time can only be logged for the last 14 days.';
  end if;
  select coalesce(sum(t.hours), 0) into day_total
  from public.time_entries t
  where t.staff_id = new.staff_id
    and t.entry_date = new.entry_date
    and t.id <> new.id;
  if day_total + coalesce(new.hours, 0) > 24 then
    raise exception 'TIME_INVALID: more than 24 hours logged for %.', new.entry_date;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_guard_staff on public.time_entries;
create trigger time_entries_guard_staff
  before insert or update on public.time_entries
  for each row execute function public.time_entries_guard_staff();

-- Daily handovers: staff file and edit only today's (UK) handover; no
-- backdating a missed day or rewriting yesterday's.
create or replace function public.daily_handovers_guard_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  if new.handover_date <> today
     or (tg_op = 'UPDATE' and old.handover_date <> today) then
    raise exception 'HANDOVER_LOCKED: only today''s handover can be filed or edited.';
  end if;
  return new;
end;
$$;

drop trigger if exists daily_handovers_guard_staff on public.daily_handovers;
create trigger daily_handovers_guard_staff
  before insert or update on public.daily_handovers
  for each row execute function public.daily_handovers_guard_staff();

-- Scorecards: the existing guard already pins every column but
-- manual_actual; staff could still set it to 999,999 ("MET 100%").
-- Self-reported actuals are now capped at 3× the target and can't be
-- negative. Body otherwise unchanged (also lets server routes through).
create or replace function public.scorecard_targets_guard_columns()
returns trigger
language plpgsql
as $$
begin
  -- Admins (and server routes) may change anything.
  if public.is_privileged_writer() then
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
  elsif new.manual_actual < 0 or new.manual_actual > greatest(old.target_value * 3, 1) then
    raise exception 'SCORECARD_INVALID: the actual must be between 0 and 3× the target (%).', old.target_value;
  end if;
  return new;
end;
$$;

-- ── 10. Storage: applicant photos (#57) ──────────────────────
-- Anyone could upload ANY file (.html, .exe) under content/applicants/ and
-- list every applicant's photo. Uploads are now limited to image file
-- names, and the folder can't be listed (the bucket is public, so the
-- photo URLs themselves keep working without a SELECT policy).
drop policy if exists "Public insert applicant photos" on storage.objects;
create policy "Public insert applicant photos"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'content'
    and (storage.foldername(name))[1] = 'applicants'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif')
  );

drop policy if exists "Public read applicant photos" on storage.objects;
drop policy if exists "Public read content" on storage.objects;
create policy "Public read content"
  on storage.objects for select
  using (
    bucket_id = 'content'
    and (coalesce((storage.foldername(name))[1], '') <> 'applicants' or public.is_admin())
  );

-- ── 11. Automation log readable by admins (#48) ──────────────
do $$
begin
  if to_regclass('public.automation_log') is not null
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'automation_log'
         and policyname = 'Admins read automation_log'
     ) then
    create policy "Admins read automation_log"
      on public.automation_log for select
      using (public.is_admin());
  end if;
end $$;

-- ── 12. Schema drift catch-up (#36 #44 #57) ──────────────────
-- Production has these from hand-made changes; environments built from the
-- migrations didn't (QA's test project: no guest bookings, empty
-- Applications/Enquiries screens, CMS couldn't save, no 'content' bucket).
-- All no-ops on production.
alter table public.bookings alter column member_id drop not null;

insert into storage.buckets (id, name, public)
values ('content', 'content', true)
on conflict (id) do nothing;

do $$
declare
  t text;
begin
  foreach t in array array['testimonials', 'hero_slides', 'galleries',
    'gallery_photos', 'video_gallery', 'partner_logos', 'curated_experiences',
    'documents', 'enquiries', 'membership_applications', 'mailing_list']
  loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and qual = 'is_admin()' and cmd = 'ALL'
    ) then
      execute format(
        'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
        'Admin full access ' || t, t);
    end if;
  end loop;
end $$;
