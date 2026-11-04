-- ============================================================
-- 20261106_c_events.sql
--   Events — Sarah's Website & Platform Build Brief (28 Oct 2026),
--   "Events" section. DATA ONLY; needs 20261106_a_website_rebuild_schema.sql
--   (programme / visibility / booking_status / short_description /
--   who_youll_meet / sponsorship_available columns) to run first.
--
--   1. Archive clean-up
--      * "Test Event · test city" (slug test-event) and "test event"
--        (slug test-event22): deleted, with their test bookings. The
--        test-event booking has a £2,000 'paid' payment row that was
--        never a Stripe charge (no payment intent) — that row is
--        removed too so events_guard_delete lets the delete through.
--        If anything there turns out to be a real Stripe payment, the
--        event is cancelled + made members-only instead of deleted.
--      * Placeholders "Members Evening · Manchester", "Members Dining ·
--        Leeds", "Members Retreat · Lake District": deleted (only a
--        cancelled, unpaid booking exists on Members Evening).
--      * "The Club INSPIRE" 4 Nov 2026 (Apollo's Muse): deleted — no
--        bookings (Inspire moved to 19 Nov).
--      * "The Club IMD" 19 Nov 2026 (Swinton Estate): set to DRAFT, not
--        deleted, pending Sarah. NB it has one confirmed £3,000 paid
--        booking (real Stripe payment) — refund it if the event is dropped.
--      Same guard fallback for every delete: a paid event is cancelled
--      and hidden (visibility 'members'), never deleted.
--
--   2. Calendar load — every row of the brief's "2026 remaining" and
--      "2027" tables, one record each (skips the internal 1 Dec PITCH
--      training and the separate 6 Oct 2027 "Car in the Sky").
--      Members included (member price £0); guests £500 + VAT on Member
--      Events, Round Tables (Sarah to confirm) and PITCH; VAT added at
--      20%. Curated Experiences are members-only and "invitation only"
--      (members request a place) until Sarah sets prices. Capacities come
--      from the brochure's programme sizes; venues the brief marks "to
--      confirm" read "Venue to be confirmed".
--
--   Idempotent: deletes are by id, inserts skip existing slugs.
-- ============================================================

-- ── 1. Archive clean-up ─────────────────────────────────────
do $$
declare
  r record;
begin
  -- Test-only payment rows (no Stripe payment intent) on the test event's
  -- bookings — they would otherwise block the delete.
  delete from public.payments p
   using public.bookings b
   where p.reference_id = b.id
     and p.payment_type = 'event_booking'
     and p.stripe_payment_intent_id is null
     and b.event_id = 'eaa2c009-4851-4c00-9cfc-9ea07c0fe8a3';
  -- …and the test booking itself (a £2,000 'confirmed' guest booking on
  -- "Test Event", venue "test"), unless a real Stripe payment backs it.
  delete from public.bookings b
   where b.event_id = 'eaa2c009-4851-4c00-9cfc-9ea07c0fe8a3'
     and not exists (
       select 1 from public.payments p
        where p.reference_id = b.id and p.stripe_payment_intent_id is not null
     );

  for r in
    select id, title from public.events
     where id in (
       'eaa2c009-4851-4c00-9cfc-9ea07c0fe8a3',  -- Test Event · test city
       '48a92e93-dcfb-4bc5-89a1-33cc8c56a25f',  -- test event (test-event22)
       '1339bac8-41f4-4ba8-bce0-39e2be70d3a0',  -- Members Evening · Manchester
       '4e3eec74-b962-4022-ae97-aaa425c526ba',  -- Members Dining · Leeds
       'f4e3cda8-2d68-47c9-9b5b-4a5c3ad8f5c1',  -- Members Retreat · Lake District
       '0c958b35-455f-4bd0-a2e5-559eb3374cfa'   -- The Club "INSPIRE" 4 Nov 2026
     )
  loop
    begin
      delete from public.events where id = r.id;
    exception when others then
      -- events_guard_delete: paid bookings → cancel + hide instead.
      update public.events set status = 'cancelled', visibility = 'members' where id = r.id;
      raise notice 'Kept % (%) as cancelled/members-only: %', r.title, r.id, sqlerrm;
    end;
  end loop;

  -- The Club IMD, 19 Nov 2026, Swinton Estate → draft pending Sarah.
  update public.events set status = 'draft'
   where id = '17403209-c063-4348-84d5-d9c55d1221c3' and status <> 'draft';
end $$;

-- ── 2. Calendar load ────────────────────────────────────────
insert into public.events (
  title, slug, programme, event_type, status, visibility, booking_status,
  start_date, end_date, venue_name, venue_city, capacity,
  member_price_pence, guest_price_pence, short_description, description,
  who_youll_meet, sponsorship_available, vat_mode, vat_rate, auto_confirm
)
select v.*, 'added', 20, true
from (values
  ('Ralph Lauren Private Shopping', 'ralph-lauren-private-shopping-nov-2026', 'partner_event', 'member_event'::event_type, 'draft'::event_status, 'public', 'invitation_only', timestamptz '2026-11-11 18:00 Europe/London', null, 'Ralph Lauren (store to be confirmed)', null, null, 0, 0, 'Private evenings and one-to-one styling for the A/W season.', 'Private evenings and one-to-one styling for the A/W season. For The Club Members; guests by invitation.', null, false),
  ('Inspire', 'inspire-2026', 'member_event', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2026-11-19 18:00 Europe/London', null, 'Venue to be confirmed', null, 100, 0, 50000, 'The year-end celebration and what comes next.', 'Inspire: The Club’s year-end celebration and what comes next. Members complimentary; guests £500 + VAT.', 'Members, founders, C-suite, investors and advisors, creatives, influencers and speakers.', true),
  ('PITCH: The Launch', 'pitch-the-launch-2026', 'pitch', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2026-11-25 18:00 Europe/London', null, 'Co-op Live', 'Manchester', 60, 0, 50000, 'The launch of our founder and investment series.', 'The launch of our founder and investment series, with active private investors.', 'Founders, VCs and angel investors, business leaders and The Club Members.', true),
  ('Ralph Lauren Private Shopping', 'ralph-lauren-private-shopping-dec-2026', 'partner_event', 'member_event'::event_type, 'draft'::event_status, 'public', 'invitation_only', timestamptz '2026-12-02 18:00 Europe/London', null, 'Ralph Lauren (store to be confirmed)', null, null, 0, 0, 'Private evenings and one-to-one styling for the A/W season.', 'Private evenings and one-to-one styling for the A/W season. For The Club Members; guests by invitation.', null, false),
  ('The Private Shopping Edit', 'the-private-shopping-edit-2026', 'london_series', 'member_event'::event_type, 'published'::event_status, 'public', 'invitation_only', timestamptz '2026-12-03 19:00 Europe/London', timestamptz '2026-12-03 23:00 Europe/London', 'Harrods Helideck', 'London', 80, 0, 0, 'Private shopping, personal styling and introductions on the Harrods Helideck.', 'The first of the Harrods Helideck Series: private shopping, personal styling and introductions. Shopping and dinner, 80 seated. For The Club Members; guests by invitation.', 'UHNW clients, luxury brands, sponsors and Harrods VIPs.', true),
  ('Abu Dhabi Grand Prix (Ferrari package)', 'abu-dhabi-grand-prix-2026', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2026-12-04 18:00 Europe/London', timestamptz '2026-12-07 18:00 Europe/London', 'Abu Dhabi', null, 100, 0, 0, 'The Abu Dhabi Grand Prix with a Ferrari package.', 'The Abu Dhabi Grand Prix with a Ferrari package. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('Winter Round Table', 'winter-round-table-leeds-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-01-13 18:00 Europe/London', null, 'Venue to be confirmed', 'Leeds', 20, 0, 50000, 'A table of 15–20 guests, one theme: AI and the future of business.', 'Theme: AI and the future of business.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Winter Round Table', 'winter-round-table-cheshire-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-01-14 18:00 Europe/London', null, 'Venue to be confirmed', 'Cheshire', 20, 0, 50000, 'A table of 15–20 guests, one theme: Serving the UHNW market through relationships.', 'Theme: Serving the UHNW market through relationships.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Winter Round Table', 'winter-round-table-london-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-01-21 18:00 Europe/London', null, 'Venue to be confirmed', 'London', 20, 0, 50000, 'A table of 15–20 guests, one theme: Building valuable, scalable businesses.', 'Theme: Building valuable, scalable businesses.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Ski, St Moritz (ICE)', 'ski-st-moritz-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-01-28 18:00 Europe/London', timestamptz '2027-01-31 18:00 Europe/London', 'St Moritz', null, 100, 0, 0, 'Ski in St Moritz, during ICE.', 'Ski in St Moritz, during ICE. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('PITCH', 'pitch-feb-2027', 'pitch', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-02-10 18:00 Europe/London', null, 'Venue to be confirmed', null, 60, 0, 50000, 'Founders raising investment, live in front of investors.', 'A live, filmed PITCH event: selected founders pitch for investment to investors, business leaders and The Club Members.', 'Founders, VCs and angel investors, business leaders and The Club Members.', true),
  ('CEO Burnout', 'ceo-burnout-2027', 'member_event', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-02-25 18:00 Europe/London', timestamptz '2027-02-26 18:00 Europe/London', 'Soho Farmhouse', null, 60, 0, 50000, 'Performance, longevity and sustainable success, with an overnight stay.', 'Performance, longevity and sustainable success. A Member Event with an overnight stay at Soho Farmhouse.', 'Members, founders, C-suite, investors and advisors, creatives, influencers and speakers.', true),
  ('Tennis (International Women’s Day)', 'tennis-international-womens-day-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-03-05 18:00 Europe/London', timestamptz '2027-03-06 18:00 Europe/London', 'Grantley Hall', null, 100, 0, 0, 'Tennis at Grantley Hall for International Women’s Day.', 'Tennis at Grantley Hall for International Women’s Day. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('Spring Round Table', 'spring-round-table-cheshire-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-03-18 18:00 Europe/London', null, 'Venue to be confirmed', 'Cheshire', 20, 0, 50000, 'A table of 15–20 guests, one theme: Serving the UHNW market through relationships.', 'Theme: Serving the UHNW market through relationships.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Spring Round Table', 'spring-round-table-london-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-03-24 18:00 Europe/London', null, 'Venue to be confirmed', 'London', 20, 0, 50000, 'A table of 15–20 guests, one theme: Building valuable, scalable businesses.', 'Theme: Building valuable, scalable businesses.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Padel & Longevity', 'padel-and-longevity-2027', 'london_series', 'member_event'::event_type, 'published'::event_status, 'public', 'invitation_only', timestamptz '2027-03-25 14:00 Europe/London', timestamptz '2027-03-25 19:00 Europe/London', 'Harrods Helideck', 'London', 120, 0, 0, 'Padel and longevity on the Harrods Helideck, in timed sessions.', 'Padel and longevity on the Harrods rooftop: timed sessions, up to 120 guests. For The Club Members; guests by invitation.', 'UHNW clients, luxury brands, sponsors and Harrods VIPs.', true),
  ('PITCH', 'pitch-apr-2027', 'pitch', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-04-22 18:00 Europe/London', null, 'Co-op Live, Bentley Lounge', 'Manchester', 60, 0, 50000, 'Founders raising investment, live in front of investors.', 'A live, filmed PITCH event: selected founders pitch for investment to investors, business leaders and The Club Members.', 'Founders, VCs and angel investors, business leaders and The Club Members.', true),
  ('North × South (with Grantley Hall)', 'north-x-south-2027', 'london_series', 'member_event'::event_type, 'published'::event_status, 'public', 'invitation_only', timestamptz '2027-04-28 14:00 Europe/London', timestamptz '2027-04-28 21:00 Europe/London', 'Harrods Helideck', 'London', 100, 0, 0, 'Shopping, salon and dinner on the Harrods Helideck, with Grantley Hall.', 'Shopping, salon and dinner on the Harrods rooftop, with Grantley Hall. For The Club Members; guests by invitation.', 'UHNW clients, luxury brands, sponsors and Harrods VIPs.', true),
  ('Miami Grand Prix (Gucci package)', 'miami-grand-prix-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-04-30 18:00 Europe/London', timestamptz '2027-05-03 18:00 Europe/London', 'Miami', null, 100, 0, 0, 'The Miami Grand Prix with a Gucci package.', 'The Miami Grand Prix with a Gucci package. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('Golf', 'golf-gleneagles-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-05-09 18:00 Europe/London', timestamptz '2027-05-10 18:00 Europe/London', 'Gleneagles', null, 100, 0, 0, 'Golf at Gleneagles.', 'Golf at Gleneagles. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('Founder’s Focus', 'founders-focus-2027', 'member_event', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-05-20 18:00 Europe/London', timestamptz '2027-05-21 18:00 Europe/London', 'Denton Reserve', null, 60, 0, 50000, 'A business surgery with expert advisors, with an overnight stay.', 'A business surgery with expert advisors. A Member Event with an overnight stay at Denton Reserve.', 'Members, founders, C-suite, investors and advisors, creatives, influencers and speakers.', true),
  ('Monaco Grand Prix', 'monaco-grand-prix-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-06-04 18:00 Europe/London', timestamptz '2027-06-07 18:00 Europe/London', 'Monaco', null, 100, 0, 0, 'The Monaco Grand Prix.', 'The Monaco Grand Prix. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('PITCH', 'pitch-jun-2027', 'pitch', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-06-16 18:00 Europe/London', null, 'Venue to be confirmed', null, 60, 0, 50000, 'Founders raising investment, live in front of investors.', 'A live, filmed PITCH event: selected founders pitch for investment to investors, business leaders and The Club Members.', 'Founders, VCs and angel investors, business leaders and The Club Members.', true),
  ('Brand & Influence', 'brand-and-influence-2027', 'member_event', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-07-02 18:00 Europe/London', null, 'Harvey Nichols', null, 60, 0, 50000, 'Building brands through influence and design.', 'Building brands through influence and design.', 'Members, founders, C-suite, investors and advisors, creatives, influencers and speakers.', true),
  ('Summer Retreat', 'summer-retreat-2027', 'curated_experience', 'retreat'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-07-05 18:00 Europe/London', timestamptz '2027-07-12 18:00 Europe/London', 'Venue to be confirmed', 'Austria', 100, 0, 0, 'A summer retreat in Austria.', 'A summer retreat in Austria. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('Summer Round Table', 'summer-round-table-leeds-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-07-15 18:00 Europe/London', null, 'Venue to be confirmed', 'Leeds', 20, 0, 50000, 'A table of 15–20 guests, one theme: AI and the future of business.', 'Theme: AI and the future of business.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Summer Round Table', 'summer-round-table-cheshire-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-07-23 18:00 Europe/London', null, 'Venue to be confirmed', 'Cheshire', 20, 0, 50000, 'A table of 15–20 guests, one theme: Serving the UHNW market through relationships.', 'Theme: Serving the UHNW market through relationships.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Summer Round Table', 'summer-round-table-london-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-07-30 18:00 Europe/London', null, 'Venue to be confirmed', 'London', 20, 0, 50000, 'A table of 15–20 guests, one theme: Building valuable, scalable businesses.', 'Theme: Building valuable, scalable businesses.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Polo', 'polo-isle-of-man-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-08-06 18:00 Europe/London', timestamptz '2027-08-08 18:00 Europe/London', 'Isle of Man', null, 100, 0, 0, 'Polo on the Isle of Man.', 'Polo on the Isle of Man. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('Golf: Ryder Cup', 'golf-ryder-cup-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-09-15 18:00 Europe/London', timestamptz '2027-09-20 18:00 Europe/London', 'Ireland', null, 100, 0, 0, 'The Ryder Cup in Ireland.', 'The Ryder Cup in Ireland. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('PITCH', 'pitch-sep-2027', 'pitch', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-09-23 18:00 Europe/London', null, 'Venue to be confirmed', null, 60, 0, 50000, 'Founders raising investment, live in front of investors.', 'A live, filmed PITCH event: selected founders pitch for investment to investors, business leaders and The Club Members.', 'Founders, VCs and angel investors, business leaders and The Club Members.', true),
  ('Aviation & Travel', 'aviation-and-travel-2027', 'london_series', 'member_event'::event_type, 'published'::event_status, 'public', 'invitation_only', timestamptz '2027-09-29 14:00 Europe/London', timestamptz '2027-09-29 19:00 Europe/London', 'Harrods Helideck', 'London', 120, 0, 0, 'An aviation salon on the Harrods Helideck.', 'An aviation and travel salon on the Harrods rooftop, up to 120 guests. For The Club Members; guests by invitation.', 'UHNW clients, luxury brands, sponsors and Harrods VIPs.', true),
  ('The Deal Table', 'the-deal-table-2027', 'member_event', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-10-06 18:00 Europe/London', null, 'Venue to be confirmed', 'Manchester', 60, 0, 50000, 'High-value sales, relationships and legacy.', 'High-value sales, relationships and legacy: how the most valuable products are sold, through trust and long-term relationships.', 'Members, founders, C-suite, investors and advisors, creatives, influencers and speakers.', true),
  ('Retreat', 'retreat-dubai-2027', 'curated_experience', 'retreat'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-10-15 18:00 Europe/London', timestamptz '2027-10-18 18:00 Europe/London', 'Dubai', null, 100, 0, 0, 'A retreat in Dubai.', 'A retreat in Dubai. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('Autumn Round Table', 'autumn-round-table-cheshire-2027', 'round_table', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-10-21 18:00 Europe/London', null, 'Venue to be confirmed', 'Cheshire', 20, 0, 50000, 'A table of 15–20 guests, one theme: Serving the UHNW market through relationships.', 'Theme: Serving the UHNW market through relationships.

Smaller rooms, focused conversation. Round Tables keep momentum between Member Events and make room for real discussion and several introductions at once.', '15–20 guests per table: The Club Members and invited business owners, founders and decision makers.', true),
  ('Inspire, with the automotive “Sky High” reveal', 'inspire-2027', 'london_series', 'member_event'::event_type, 'published'::event_status, 'public', 'invitation_only', timestamptz '2027-11-04 14:00 Europe/London', timestamptz '2027-11-04 19:00 Europe/London', 'Harrods Helideck', 'London', 80, 0, 50000, 'The year-end lunch on the Harrods Helideck, with an automotive reveal.', 'The year-end lunch: celebration and what comes next, with the automotive “Sky High” reveal. A private lunch on the Harrods rooftop, 80 seated. Members included; guests by invitation.', 'UHNW clients, luxury brands, sponsors and Harrods VIPs.', true),
  ('Shooting (International Men’s Day)', 'shooting-international-mens-day-2027', 'curated_experience', 'curated_luxury'::event_type, 'published'::event_status, 'members', 'invitation_only', timestamptz '2027-11-19 18:00 Europe/London', timestamptz '2027-11-20 18:00 Europe/London', 'Yorkshire', null, 100, 0, 0, 'Shooting in Yorkshire for International Men’s Day.', 'Shooting in Yorkshire for International Men’s Day. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.', 'UHNW guests and luxury brands.', true),
  ('PITCH', 'pitch-nov-2027', 'pitch', 'member_event'::event_type, 'published'::event_status, 'public', 'open', timestamptz '2027-11-25 18:00 Europe/London', null, 'Venue to be confirmed', null, 60, 0, 50000, 'Founders raising investment, live in front of investors.', 'A live, filmed PITCH event: selected founders pitch for investment to investors, business leaders and The Club Members.', 'Founders, VCs and angel investors, business leaders and The Club Members.', true)
) as v (
  title, slug, programme, event_type, status, visibility, booking_status,
  start_date, end_date, venue_name, venue_city, capacity,
  member_price_pence, guest_price_pence, short_description, description,
  who_youll_meet, sponsorship_available
)
on conflict (slug) do nothing;
