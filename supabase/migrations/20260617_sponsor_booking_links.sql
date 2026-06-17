-- Sponsor booking links
-- ----------------------------------------------------------------------------
-- Each sponsor on an event can now be given a custom event TICKET price (what
-- they pay to attend, distinct from `amount_pence` which is what they invest)
-- and a unique, shareable booking link. Sponsors are often external companies
-- (not members), so:
--   * member_id becomes optional
--   * we store the sponsor's contact details directly on the row
--   * booking_token backs the personalised /events/<slug>?s=<token> link
--   * event_price_pence overrides the event-level sponsor_price_pence per sponsor
--   * invite_sent_at records when the templated invite email went out
--
-- Bookings made through a sponsor link are attributed back via sponsorship_id.

alter table public.sponsorships
  alter column member_id drop not null;

alter table public.sponsorships
  add column if not exists sponsor_name text,
  add column if not exists sponsor_email text,
  add column if not exists sponsor_company text,
  add column if not exists event_price_pence integer,
  add column if not exists booking_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists invite_sent_at timestamptz;

-- The link token must be unique so a lookup by token resolves to one sponsor.
create unique index if not exists sponsorships_booking_token_key
  on public.sponsorships (booking_token);

-- Attribute a booking back to the sponsorship its link came from. ON DELETE
-- SET NULL so removing a sponsor never deletes the attendee's booking/payment.
alter table public.bookings
  add column if not exists sponsorship_id uuid
    references public.sponsorships(id) on delete set null;
