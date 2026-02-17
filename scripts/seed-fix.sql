-- ============================================================
-- FIX: Member tier distribution (15 tier_1, 8 tier_2, 5 tier_3)
-- Business memberships on tier_2 and tier_3 only
-- ============================================================

-- Move members 9 (Wright Wellness) and 22 (Turner Automotive) to individual tier_1
UPDATE public.members SET membership_tier = 'tier_1', membership_type = 'individual', monthly_intro_quota = 3
  WHERE id = '30000000-0000-4000-a000-000000000009';
UPDATE public.members SET membership_tier = 'tier_1', membership_type = 'individual', monthly_intro_quota = 3
  WHERE id = '30000000-0000-4000-a000-000000000022';
-- Move member 14 (Velocity Ventures) to tier_1
UPDATE public.members SET membership_tier = 'tier_1', monthly_intro_quota = 3
  WHERE id = '30000000-0000-4000-a000-000000000014';

-- Result:
-- tier_1 (15 individual): 2,5,8,9,11,13,14,15,17,19,21,22,23,25,27
-- tier_2 (8 business): 1,4,6,10,16,20,24,26
-- tier_3 (5 business): 3,7,12,18,28

-- ============================================================
-- SEED: Communications data (recent sends)
-- ============================================================

INSERT INTO public.communications (member_id, template_name, channel, subject, body_preview, sent_at, opened_at, clicked_at, status, created_at) VALUES
  -- Booking confirmations
  ('30000000-0000-4000-a000-000000000001', 'Booking Confirmation', 'email', 'Your booking is confirmed — Soho Farmhouse', 'Hi Emma, your booking for Soho Farmhouse — Beauty & Wellness has been confirmed.', now() - interval '18 days', now() - interval '18 days' + interval '2 hours', now() - interval '18 days' + interval '3 hours', 'sent', now() - interval '18 days'),
  ('30000000-0000-4000-a000-000000000003', 'Booking Confirmation', 'email', 'Your booking is confirmed — Soho Farmhouse', 'Hi Sophia, your booking for Soho Farmhouse — Beauty & Wellness has been confirmed.', now() - interval '17 days', now() - interval '17 days' + interval '1 hour', null, 'sent', now() - interval '17 days'),
  ('30000000-0000-4000-a000-000000000002', 'Booking Confirmation', 'email', 'Your booking is confirmed — Dragons Den Pitch Night', 'Hi Oliver, your booking for Dragons Den Pitch Night has been confirmed.', now() - interval '12 days', now() - interval '12 days' + interval '30 minutes', now() - interval '12 days' + interval '1 hour', 'sent', now() - interval '12 days'),
  ('30000000-0000-4000-a000-000000000007', 'Booking Confirmation', 'email', 'Your booking is confirmed — Ibiza Retreat', 'Hi Amelia, your booking for the Ibiza Business & Wellness Retreat has been confirmed.', now() - interval '10 days', now() - interval '10 days' + interval '45 minutes', now() - interval '10 days' + interval '2 hours', 'sent', now() - interval '10 days'),
  -- Introduction notifications
  ('30000000-0000-4000-a000-000000000002', 'Introduction Notification', 'email', 'New introduction: Oliver Chen & George Kingston', 'Hi Oliver, we have a great introduction for you. George Kingston from KingstonAI shares your interest in technology.', now() - interval '10 days', now() - interval '10 days' + interval '1 hour', null, 'sent', now() - interval '10 days'),
  ('30000000-0000-4000-a000-000000000008', 'Introduction Notification', 'email', 'New introduction: George Kingston & Oliver Chen', 'Hi George, we have a great introduction for you. Oliver Chen from TechBridge Solutions shares your interest in technology.', now() - interval '10 days', now() - interval '10 days' + interval '2 hours', now() - interval '10 days' + interval '3 hours', 'sent', now() - interval '10 days'),
  -- Event reminders
  ('30000000-0000-4000-a000-000000000001', 'Event Reminder 7-Day', 'email', 'Reminder: Soho Farmhouse in 7 days', 'Hi Emma, just a reminder that Soho Farmhouse — Beauty & Wellness is coming up on 28 Feb 2026.', now() - interval '7 days', now() - interval '7 days' + interval '3 hours', null, 'sent', now() - interval '7 days'),
  ('30000000-0000-4000-a000-000000000005', 'Event Reminder 7-Day', 'email', 'Reminder: Soho Farmhouse in 7 days', 'Hi Charlotte, just a reminder that Soho Farmhouse — Beauty & Wellness is coming up on 28 Feb 2026.', now() - interval '7 days', now() - interval '7 days' + interval '5 hours', now() - interval '7 days' + interval '6 hours', 'sent', now() - interval '7 days'),
  -- Welcome emails
  ('30000000-0000-4000-a000-000000000023', 'Welcome New Member', 'email', 'Welcome to The Club, Hannah', 'Hi Hannah, welcome to The Club by Sarah Restrick. We are delighted to have you as a member.', now() - interval '6 days', now() - interval '6 days' + interval '20 minutes', now() - interval '6 days' + interval '1 hour', 'sent', now() - interval '6 days'),
  ('30000000-0000-4000-a000-000000000027', 'Welcome New Member', 'email', 'Welcome to The Club, Isla', 'Hi Isla, welcome to The Club by Sarah Restrick. We are delighted to have you as a member.', now() - interval '11 days', now() - interval '11 days' + interval '15 minutes', null, 'sent', now() - interval '11 days'),
  -- Monthly intro report
  ('30000000-0000-4000-a000-000000000012', 'Monthly Introduction Report', 'email', 'Your January Introduction Report', 'Hi Alexander, here is your monthly introduction report for January 2026. You had 5 introductions this month.', now() - interval '16 days', now() - interval '16 days' + interval '4 hours', now() - interval '16 days' + interval '5 hours', 'sent', now() - interval '16 days'),
  ('30000000-0000-4000-a000-000000000007', 'Monthly Introduction Report', 'email', 'Your January Introduction Report', 'Hi Amelia, here is your monthly introduction report for January 2026. You had 4 introductions this month.', now() - interval '16 days', now() - interval '16 days' + interval '6 hours', null, 'sent', now() - interval '16 days'),
  -- Draft comms
  ('30000000-0000-4000-a000-000000000017', 'Event Reminder 1-Day', 'email', 'Tomorrow: Soho Farmhouse — Beauty & Wellness', 'Hi Grace, just a final reminder that Soho Farmhouse — Beauty & Wellness is tomorrow.', null, null, null, 'draft', now() - interval '1 day');

-- ============================================================
-- SEED: Additional payment data (sponsorships, GoCardless, overdue)
-- ============================================================

INSERT INTO public.payments (member_id, payment_type, amount_pence, currency, status, payment_method, due_date, paid_at, description, created_at) VALUES
  -- Sponsorship invoices
  ('30000000-0000-4000-a000-000000000012', 'sponsorship', 500000, 'GBP', 'paid', 'invoice', '2026-01-31', now() - interval '3 weeks', 'Dragons Den Pitch Night — Gold Sponsor Package', now() - interval '5 weeks'),
  ('30000000-0000-4000-a000-000000000007', 'sponsorship', 750000, 'GBP', 'paid', 'invoice', '2026-02-15', now() - interval '2 weeks', 'Soho Farmhouse — Platinum Sponsor Package', now() - interval '4 weeks'),
  ('30000000-0000-4000-a000-000000000028', 'sponsorship', 350000, 'GBP', 'pending', 'invoice', '2026-02-28', null, 'IWD Celebration — Silver Sponsor Package', now() - interval '3 weeks'),
  -- GoCardless membership payments
  ('30000000-0000-4000-a000-000000000010', 'membership', 75000, 'GBP', 'paid', 'gocardless', '2026-01-15', now() - interval '4 weeks', 'Q1 2026 Membership — Tier 2 Business', now() - interval '5 weeks'),
  ('30000000-0000-4000-a000-000000000016', 'membership', 75000, 'GBP', 'paid', 'gocardless', '2026-01-15', now() - interval '4 weeks', 'Q1 2026 Membership — Tier 2 Business', now() - interval '5 weeks'),
  ('30000000-0000-4000-a000-000000000020', 'membership', 75000, 'GBP', 'paid', 'gocardless', '2026-01-15', now() - interval '3 weeks', 'Q1 2026 Membership — Tier 2 Business', now() - interval '5 weeks'),
  -- More event payments via Stripe
  ('30000000-0000-4000-a000-000000000006', 'event', 20000, 'GBP', 'paid', 'stripe', null, now() - interval '10 days', 'Dragons Den Pitch Night', now() - interval '10 days'),
  ('30000000-0000-4000-a000-000000000008', 'event', 20000, 'GBP', 'paid', 'stripe', null, now() - interval '9 days', 'Dragons Den Pitch Night', now() - interval '9 days'),
  ('30000000-0000-4000-a000-000000000015', 'event', 250000, 'GBP', 'paid', 'stripe', null, now() - interval '8 days', 'Ibiza Business & Wellness Retreat', now() - interval '8 days'),
  -- Overdue payments
  ('30000000-0000-4000-a000-000000000022', 'membership', 37500, 'GBP', 'overdue', 'gocardless', '2026-01-31', null, 'Q1 2026 Membership — Tier 1 Individual (overdue)', now() - interval '5 weeks'),
  ('30000000-0000-4000-a000-000000000011', 'membership', 37500, 'GBP', 'overdue', 'stripe', '2026-02-01', null, 'Q1 2026 Membership — Tier 1 Individual (overdue)', now() - interval '4 weeks');
