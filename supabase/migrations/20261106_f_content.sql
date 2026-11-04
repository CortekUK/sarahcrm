-- ============================================================
-- 20261106_f_content.sql
--   Content for Portfolio, Success Stories, Journal and Rewards
--   (Sarah's Website & Platform Build Brief, 28 Oct 2026).
--   Run AFTER 20261106_a_website_rebuild_schema.sql.
--
--   0. Schema extra: blog_posts.status may be 'pending_review'
--      (a member's Journal article awaiting Sarah's approval).
--   1. Testimonials: the invented quotes are switched off; the six
--      real quotes from the brief are added verbatim.
--      (Sarah still needs written permission from each person.)
--   2. Portfolio launch set (brief + brochure facts only). Rows with
--      full content are published + featured; rows waiting on Sarah
--      are drafts.
--   3. Rewards clean-up: the test partners, The Dorchester and
--      Vacheron Constantin come off; Gleneagles leaves the public page.
--      Partners/offers with member claims can't be deleted (DB guard),
--      so those are switched off (is_active = false, is_public = false).
--   4. Journal: no posts are seeded (launch articles come from Sarah).
--
--   Guarded — safe to run twice.
-- ============================================================

-- ── 0. blog_posts: allow 'pending_review' ───────────────────
alter table public.blog_posts drop constraint if exists blog_posts_status_check;
alter table public.blog_posts add constraint blog_posts_status_check
  check (status in ('published', 'unpublished', 'pending_review'));

-- ── 1. Testimonials ─────────────────────────────────────────
-- Everything that isn't one of the six real quotes goes inactive
-- (Alexandra Cole, Marcus Bell, Sophie Linwood were invented).
update public.testimonials
   set is_active = false
 where person_name not in ('Mish Liyanage', 'Jonny Christie', 'Gillian Robson',
                           'Richard Hughes', 'Paul Boulton', 'Melanie Fourie')
   and is_active;

insert into public.testimonials
  (person_name, person_title, company_name, quote_text, testimonial_type, display_order, is_active)
select v.person_name, null, v.company_name, v.quote_text, v.testimonial_type, v.display_order, true
  from (values
    ('Mish Liyanage', 'The Mistoria Group',
     'I''ve been part of The Club and worked with Sarah since its inception, seeing the network become what it is today. It is one of my most valuable business networks.',
     'member', 0),
    ('Jonny Christie', 'The Property Sourcing Co.',
     'Through Sarah and The Club we have completed multiple million-pound transactions. There is no one better at connecting brands directly to clients.',
     'member', 1),
    ('Gillian Robson', 'SGR Construction',
     'One evening that stands out was with Vogue editor Alexandra Shulman. The conversation, the room, the engagement: everyone was so open. It was amazing.',
     'member', 2),
    ('Richard Hughes', 'Lamborghini Manchester',
     'Four years with The Club. Incredible events, cars sold, quality people. She does what she says she will, and more.',
     'partner', 3),
    ('Paul Boulton', 'Grantley Hall',
     'Five years of events with The Club. We have been introduced to high-quality clients and brands, with incredible results. I''d highly recommend Sarah and The Club.',
     'venue', 4),
    ('Melanie Fourie', 'Together Money',
     'Together has completed over £10m in loan transactions, and I''ve also met friends and fantastic partners. She is incredible at what she does.',
     'partner', 5)
  ) as v(person_name, company_name, quote_text, testimonial_type, display_order)
 where not exists (
   select 1 from public.testimonials t where t.person_name = v.person_name
 );

-- ── 2. Portfolio launch set ─────────────────────────────────
insert into public.portfolio_case_studies
  (slug, title, partner_names, category, location, event_date, date_label, headline_result,
   hero_image_url, hero_video_url, brief, delivered, results, gallery_urls,
   partner_quote, partner_quote_by, layout, display_order, is_featured, is_published)
values
  -- Published + featured (full content in the brief / brochure)
  ('gleneagles-golf-tennis-hospitality',
   'Gleneagles: golf, tennis and hospitality',
   'Gleneagles',
   'curated_experience',
   'Gleneagles, Scotland',
   null, 'Sep 2025',
   '£1.5m in sales in three days',
   'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/gleneagles-hotel.jpg', null,
   'A curated golf and hospitality experience for The Club''s UHNW guests, with partner brands woven through the programme. 130 guests across two nights and three days, including 10 Premiership football legends and their celebrity partners.',
   '["Venue: Gleneagles, Scotland, across two nights and three days", "Audience: 130 guests, including 10 Premiership football legends and their celebrity partners", "Programme: golf, tennis and dining, from a £120k investment by The Club", "Partners: a luxury retailer, a luxury timepiece brand and a US property developer woven through the programme"]'::jsonb,
   '[{"figure": "£1.5m", "label": "In sales for Gleneagles across the three days"}, {"figure": "20", "label": "New prospect clients introduced to a luxury retailer, with £60k spent by one of them"}, {"figure": "10", "label": "Watches sold through a Wayne Rooney collaboration made by The Club"}, {"figure": "£3m", "label": "Investment sold into a Nashville development from one introduction"}]'::jsonb,
   array['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/gleneagles-hotel.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/gleneagles-estate.jpg'],
   null, null,
   'full', 1, true, true),

  ('brand-and-influence-harvey-nichols-manchester',
   'Brand & Influence, Harvey Nichols Manchester',
   'Harvey Nichols',
   'brand_activation',
   'Harvey Nichols, Manchester',
   null, 'Jul 2026',
   'Manchester Evening News cover story',
   'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/brand-influence-harvey-nichols.jpg', null,
   'A flagship in-conversation with Alexandra Shulman CBE, and an example of the guest list and reach The Club brings to a brand''s room. A curated room that drew celebrity attendees and cover press.',
   '["Venue: Harvey Nichols, Manchester", "Audience: 60 attendees from The Club''s network", "Talent: 10 celebrities, including main speaker Alexandra Shulman CBE", "Format: a flagship in-conversation", "Press and content: Manchester Evening News cover story and 22k+ social media hits"]'::jsonb,
   '[{"figure": "Cover", "label": "Manchester Evening News cover story"}, {"figure": "22k+", "label": "Social media hits"}, {"figure": "60", "label": "Attendees"}, {"figure": "10", "label": "Celebrities, including main speaker Alexandra Shulman CBE"}]'::jsonb,
   array['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/brand-influence-harvey-nichols.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/brand-influence-guests.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-05.jpg'],
   null, null,
   'half', 2, true, true),

  ('hr-owen-activations',
   'HR Owen activations',
   'HR Owen · Lamborghini, Lotus, Maserati, Bentley',
   'brand_activation',
   null,
   null, '12 months',
   '£90k invested, returning 10x',
   'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/hr-owen-lamborghini.jpg', null,
   'Membership, sponsorship and event activations with The Club, putting HR Owen in front of qualified UHNW buyers and following every introduction through to sale. Twelve months of event activations, turning into sales over 24 months.',
   '["Membership, sponsorship and event activations across 12 months", "Member events, brand activations and drive & stay days", "Qualified UHNW buyers introduced, with every introduction followed through to sale", "Partnerships introduced for complementary luxury brands serving UHNWIs"]'::jsonb,
   '[{"figure": "3", "label": "Lamborghinis sold through The Club introductions"}, {"figure": "5", "label": "Cars sold across Lotus, Maserati and Bentley (used)"}, {"figure": "£90k", "label": "Invested, returning 10x across 12 months"}, {"figure": "Multiple", "label": "Partnerships introduced for complementary luxury brands serving UHNWIs"}]'::jsonb,
   array['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/hr-owen-lamborghini.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/hr-owen-drive-day.jpg'],
   'Four years with The Club. Incredible events, cars sold, quality people. She does what she says she will, and more.',
   'Richard Hughes, Lamborghini Manchester',
   'half', 3, true, true),

  ('grantley-hall',
   'Grantley Hall',
   'Grantley Hall',
   'member_event',
   'Grantley Hall, North Yorkshire',
   null, '4 years',
   '£20–40k revenue per event across 10+ events',
   'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/grantley-hall-arrival.jpg', 'https://youtu.be/hQlyvKGl3Ak',
   'A hospitality partnership built on the right guests, not more footfall. Venues need guests who book private dining, host corporate events and return with their own clients; The Club brings those guests to Grantley Hall, with a strategy to keep them.',
   '["Venue: Grantley Hall, North Yorkshire", "10+ events over four years", "Audience: 20–100 clients introduced at each event", "Partners: brands such as Louis Vuitton and Lamborghini alongside"]'::jsonb,
   '[{"figure": "£20–40k", "label": "Revenue per event"}, {"figure": "10+", "label": "Events in four years"}, {"figure": "20–100", "label": "Clients introduced at each event"}]'::jsonb,
   array['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/grantley-hall-arrival.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/grantley-hall-evening.jpg'],
   'Five years of events with The Club. We have been introduced to high-quality clients and brands, with incredible results. I''d highly recommend Sarah and The Club.',
   'Paul Boulton, Grantley Hall',
   'full', 4, true, true),

  -- Drafts: waiting on Sarah (content / images / figure decision)
  ('lamborghini-christmas-party',
   'Lamborghini Christmas Party', 'Lamborghini', 'brand_activation',
   null, null, null, null, null, null, null,
   '[]'::jsonb, '[]'::jsonb, '{}', null, null,
   'half', 5, false, false),

  ('arighi-bianchi-ferrari',
   'Arighi Bianchi × Ferrari', 'Arighi Bianchi · Ferrari', 'brand_activation',
   null, null, null, null, null, null, null,
   '[]'::jsonb, '[]'::jsonb, '{}', null, null,
   'half', 6, false, false),

  -- PITCH × Parced IO: brochure says £800k raised, the PITCH decks say
  -- £700k. headline_result stays empty until Sarah confirms the figure.
  ('pitch-co-op-live-bentley-lounge',
   'PITCH at Co-op Live, Bentley Lounge', 'Parced IO', 'pitch',
   'Bentley Lounge, Co-op Live, Manchester', null, 'Apr 2026',
   null,
   'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-parced-erin-short.jpg', null,
   'Founder Erin Short joined PITCH: qualification and due diligence, a launch session, three 1:1 training sessions, a live pitch to investors, then investor matching and the PITCH podcast.',
   '["Venue: the Bentley Lounge at Co-op Live, Manchester", "Qualification and due diligence, a launch session and three 1:1 training sessions", "A live pitch to investors", "Investor matching and the PITCH podcast"]'::jsonb,
   '[{"figure": "£5k", "label": "Invested in the full PITCH programme"}, {"figure": "£600k", "label": "Raised directly through investors introduced by The Club"}, {"figure": "5%", "label": "Participation on the agreed PITCH structure"}]'::jsonb,
   array['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-co-op-live.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-bentley-lounge-1.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-bentley-lounge-2.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-bentley-lounge-3.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-bentley-lounge-4.jpg', 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-bentley-lounge-5.jpg'],
   null, null,
   'full', 7, false, false),

  ('estelle-manor-curated-day',
   'Estelle Manor curated day', 'Estelle Manor', 'curated_experience',
   'Estelle Manor', null, '2026', null, null, null, null,
   '[]'::jsonb, '[]'::jsonb, '{}', null, null,
   'half', 8, false, false)
on conflict (slug) do nothing;

-- ── 3. Rewards clean-up ─────────────────────────────────────
-- Targets: the two "test" partners (incl. "test / wefwef" under Golf),
-- The Dorchester, Vacheron Constantin. First switch them (and their
-- offers) off everywhere; then delete the ones with no member claims.
-- A partner with claims stays in the table, inactive and hidden
-- (the DB guard refuses to delete it — claim history is kept).
with targets as (
  select id from public.reward_partners
   where (lower(trim(name)) = 'test')
      or name in ('The Dorchester', 'Vacheron Constantin')
)
update public.reward_offers o
   set is_active = false
  from targets t
 where o.partner_id = t.id and o.is_active;

update public.reward_partners
   set is_active = false, is_public = false
 where (lower(trim(name)) = 'test' or name in ('The Dorchester', 'Vacheron Constantin'))
   and (is_active or is_public);

delete from public.reward_offers o
 using public.reward_partners p
 where o.partner_id = p.id
   and (lower(trim(p.name)) = 'test' or p.name in ('The Dorchester', 'Vacheron Constantin'))
   and not exists (select 1 from public.reward_claims c where c.offer_id = o.id);

delete from public.reward_partners p
 where (lower(trim(p.name)) = 'test' or p.name in ('The Dorchester', 'Vacheron Constantin'))
   and not exists (
     select 1 from public.reward_claims c
       join public.reward_offers o on o.id = c.offer_id
      where o.partner_id = p.id
   );

-- Gleneagles stays a member benefit but leaves the public page.
update public.reward_partners
   set is_public = false
 where name = 'Gleneagles' and is_public;
