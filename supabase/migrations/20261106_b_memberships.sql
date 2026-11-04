-- ============================================================
-- 20261106_b_memberships.sql
--
-- Memberships rebuild (Sarah's brief, 28 Oct 2026). Content/data only,
-- plus a few small additive columns at the top.
--
-- Run AFTER 20261106_a_website_rebuild_schema.sql (needs
-- public.business_categories).
--
--   * Schema (additive, guarded):
--       membership_plans.headline     — card headline ("Introductions, on demand")
--       membership_plans.audience     — the "For" line ("Decision makers · £500k+ turnover")
--       membership_comparison.tier_1_text / tier_2_text / tier_3_text
--                                     — text cells for the comparison table
--                                       (when set they replace the tick/dash)
--       membership_applications.goals — "Goals" answer on the application form
--   * membership_plans: the three tiers become
--       tier_1 → Access                        (slug access)              £2,500
--       tier_2 → The Club Membership           (slug the-club-membership) £6,000
--       tier_3 → The Club Business Membership  (slug business)            £15,000
--     Prices stay NET (VAT added at charge time). Annual only:
--     monthly_price_pence = round(annual / 12) so legacy paths still work.
--     The £30,000 Corporate tier is gone (its row becomes the Business
--     Membership; all tier_2/tier_3 members are test data).
--   * membership_comparison: rows replaced with the brief's table.
--   * app_settings 'membership_comparison_footnote': the table footnote.
--   * membership_benefits: nine old cards → the six named in the brief.
--   * business_categories: the 16 "one business per category" chips.
--
-- Safe to run twice (re-running resets the comparison rows + benefit
-- copy to the brief's text).
-- ============================================================

-- ── schema ──────────────────────────────────────────────────
alter table public.membership_plans
  add column if not exists headline text,
  add column if not exists audience text;

alter table public.membership_comparison
  add column if not exists tier_1_text text,
  add column if not exists tier_2_text text,
  add column if not exists tier_3_text text;

alter table public.membership_applications
  add column if not exists goals text;

-- ── membership_plans ────────────────────────────────────────
-- Order matters: slug is UNIQUE, and the old tier_2 row owns 'business'
-- which the tier_3 row takes over. Move tier_2 off it first.
update public.membership_plans set
  slug                = 'the-club-membership',
  name                = 'The Club Membership',
  headline            = 'The room, all year',
  audience            = 'Owners and decision makers · £1m+ turnover',
  lede                = 'Two places at every Round Table, Member Event, Harrods Series and PITCH event, for your team or a guest. Full platform and CRM access.',
  contract_terms      = 'a year + VAT',
  annual_price_pence  = 600000,
  monthly_price_pence = 50000,
  features            = '{}'::text[],
  display_order       = 1,
  is_active           = true
where tier_classification = 'tier_2';

update public.membership_plans set
  slug                = 'business',
  name                = 'The Club Business Membership',
  headline            = 'Your category, exclusively',
  audience            = 'Owners and decision makers · £10m+ turnover',
  lede                = 'Four places at every event, no other business member in your category, priority introductions and a bespoke event we fill with your prospects.',
  contract_terms      = 'a year + VAT',
  annual_price_pence  = 1500000,
  monthly_price_pence = 125000,
  features            = '{}'::text[],
  display_order       = 2,
  is_active           = true
where tier_classification = 'tier_3';

update public.membership_plans set
  slug                = 'access',
  name                = 'Access',
  headline            = 'Introductions, on demand',
  audience            = 'Decision makers · £500k+ turnover',
  lede                = 'For time-poor clients who want the introductions. Advertise on our platform and reach the full database; The Club makes the introductions and helps convert them. One event included.',
  contract_terms      = 'a year + VAT',
  annual_price_pence  = 250000,
  monthly_price_pence = 20833,
  features            = '{}'::text[],
  display_order       = 0,
  is_active           = true
where tier_classification = 'tier_1';

-- ── membership_comparison ───────────────────────────────────
-- Columns individual/business/corporate are the tier_1/tier_2/tier_3
-- booleans (names predate the rename). Text cells carry the brief's copy.
delete from public.membership_comparison;

insert into public.membership_comparison
  (label, individual, business, corporate, tier_1_text, tier_2_text, tier_3_text, display_order, is_active)
values
  ('Annual fee', true, true, true,
     '£2,500', '£6,000', '£15,000', 0, true),
  ('Events', true, true, true,
     'One event included; others at additional cost',
     'Two places at Round Tables, Member Events, Harrods Series and PITCH',
     'Four places at every event, plus a bespoke event we fill', 1, true),
  ('Platform', true, true, true,
     'Advertise on the platform, full database access',
     'Full platform and CRM access',
     'Preferred status, priority introductions and CRM marketing campaigns', 2, true),
  ('Exclusivity', false, false, true,
     '—', '—', 'No other business member in your category', 3, true),
  ('Benefits', true, true, true,
     'Discounts and concierge', 'Discounts and concierge', 'Discounts and concierge', 4, true),
  ('For', true, true, true,
     '£500k+ turnover', '£1m+ turnover', '£10m+ turnover', 5, true);

-- ── comparison footnote (app_settings) ──────────────────────
insert into public.app_settings (key, value)
values (
  'membership_comparison_footnote',
  to_jsonb('All fees + VAT, paid annually. Introductions are made through the platform. Commission applies to converted business in every tier, except private banking and wealth management on The Club Membership. Bespoke event costs are additional, negotiated through our preferred suppliers.'::text)
)
on conflict (key) do update set value = excluded.value;

-- ── membership_benefits: nine → six ─────────────────────────
-- Update positions 1–6 in place (keeps each card's uploaded image),
-- then drop 7–9.
insert into public.membership_benefits (position, numeral, title, body, is_visible)
values
  (1, 'I', 'Access to The Club network',
     'A private members'' club for founders, owners, senior executives and high-net-worth individuals. Membership is capped and by referral, and every applicant is vetted to protect the quality of the room.', true),
  (2, 'II', 'Professional Matchmaking',
     'Qualified one-to-one introductions built around your goals and clients, up to ten a month depending on tier, then tracked through to revenue.', true),
  (3, 'III', 'The events calendar',
     'Five programmes, one calendar: Member Events, Round Tables, PITCH, Curated Experiences and the London Series, at five-star venues across the UK and beyond.', true),
  (4, 'IV', 'Advertise on the platform',
     'Advertise on our platform and reach our full profiled database of 7,000+, beyond the members in the room.', true),
  (5, 'V', 'Member Rewards & Members Card',
     'Member discounts across retail, hospitality, travel and more, with your Members Card, partner rates and event access in one app.', true),
  (6, 'VI', 'Private Concierge',
     'Collection, private travel, transfers and access for The Club Members and their guests. Ask for anything; we deliver it.', true)
on conflict (position) do update set
  numeral    = excluded.numeral,
  title      = excluded.title,
  body       = excluded.body,
  is_visible = true;

-- The old card IX (Corporate Luxury Concierge) carried an uploaded
-- concierge photo — move it onto the new Private Concierge card.
update public.membership_benefits b set image_url = old.image_url
  from public.membership_benefits old
  where b.position = 6 and old.position = 9
    and old.image_url is not null and old.image_url not like '/%';

delete from public.membership_benefits where position > 6;

-- Cards 2–6 previously carried placeholder site images that matched the
-- old topics; give the new topics sensible defaults only where the image
-- was one of the old bundled placeholders (uploaded photos are kept).
update public.membership_benefits set image_url = '/gallery/land1.png'
  where position = 2 and (image_url is null or image_url like '/%');
update public.membership_benefits set image_url = '/gallery/land3.png'
  where position = 3 and (image_url is null or image_url like '/%');
update public.membership_benefits set image_url = '/gallery/land2.png'
  where position = 4 and (image_url is null or image_url like '/%');
update public.membership_benefits set image_url = '/theclub-section.png'
  where position = 5 and (image_url is null or image_url like '/%');
update public.membership_benefits set image_url = '/gallery/bigland.png'
  where position = 6 and (image_url is null or image_url like '/%');

-- ── business_categories (16 chips) ──────────────────────────
insert into public.business_categories (name, is_taken, display_order)
values
  ('Private aviation',      false, 0),
  ('Private banking',       false, 1),
  ('Wealth & finance',      false, 2),
  ('Insurance',             false, 3),
  ('Legal',                 false, 4),
  ('Property & development',false, 5),
  ('Construction',          false, 6),
  ('Prestige automotive',   false, 7),
  ('Jewellery & watches',   false, 8),
  ('Interiors & design',    false, 9),
  ('Travel & hotels',       false, 10),
  ('Events & hospitality',  false, 11),
  ('Concierge & lifestyle', false, 12),
  ('Health & longevity',    false, 13),
  ('Security',              false, 14),
  ('Yachting',              false, 15)
on conflict (name) do nothing;
