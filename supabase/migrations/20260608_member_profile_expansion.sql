-- Master Member Profile expansion (Spec §4 — relationship-intelligence core)
-- ----------------------------------------------------------------------
-- Adds the full set of profile fields the spec calls for so the member
-- record becomes the single source of truth for company depth,
-- introduction strategy, objectives, budgets, preferences, outcomes and
-- AI relationship scores. Designed once, in full — UI surfaces these
-- progressively, but the schema is complete from here.
--
-- Also extends two enums:
--   membership_type   + 'partner'  (Individual / Business / Partner)
--   membership_status + 'paused'   (Active / Paused / Cancelled …)
-- NOTE: ALTER TYPE ... ADD VALUE is run separately (it cannot share a
-- transaction with statements that use the new value). This file is the
-- version-controlled record; application is done via the same values.

-- ── Enum extensions ───────────────────────────────────────────────────
alter type public.membership_type add value if not exists 'partner';
alter type public.membership_status add value if not exists 'paused';

-- ── Member profile columns ────────────────────────────────────────────
alter table public.members
  -- Membership administration
  add column if not exists payment_frequency text,
  add column if not exists membership_manager text,
  add column if not exists membership_value_pence integer,
  add column if not exists contract_signed boolean not null default false,
  add column if not exists contract_url text,
  add column if not exists membership_agreement_url text,
  add column if not exists introducer_agreement_url text,
  add column if not exists nda_url text,

  -- Company depth
  add column if not exists company_logo_url text,
  add column if not exists company_linkedin_url text,
  add column if not exists sector text,
  add column if not exists sub_sector text,
  add column if not exists employee_count text,
  add column if not exists annual_turnover text,
  add column if not exists estimated_profit text,
  add column if not exists offices text,
  add column if not exists company_address text,
  add column if not exists invoice_address text,
  add column if not exists accounts_contact_name text,
  add column if not exists accounts_contact_email text,
  add column if not exists accounts_contact_phone text,
  add column if not exists invoice_chaser_contact text,
  add column if not exists fd_contact text,

  -- Payment & billing flags (history/spend derive from `payments`)
  add column if not exists card_on_file boolean not null default false,
  add column if not exists direct_debit_active boolean not null default false,
  add column if not exists lifetime_value_pence integer,

  -- Rich member profile
  add column if not exists career_history text,
  add column if not exists awards text,
  add column if not exists media_features text,
  add column if not exists achievements text,
  add column if not exists charitable_interests text,
  add column if not exists hobbies text,
  add column if not exists sporting_interests text,
  add column if not exists favourite_brands text,

  -- Introduction strategy
  add column if not exists intro_target_types text,
  add column if not exists intro_target_criteria text,
  add column if not exists dream_introductions text,
  add column if not exists what_they_can_offer text,

  -- Business objectives & budgets
  add column if not exists business_objectives text,
  add column if not exists budgets text,
  add column if not exists interest_flags text[],

  -- Preferences
  add column if not exists event_preferences text[],
  add column if not exists travel_profile text,
  add column if not exists dietary_requirements text,
  add column if not exists allergies text,
  add column if not exists drink_preferences text,
  add column if not exists favourite_restaurants text,
  add column if not exists birthday date,
  add column if not exists partner_name text,
  add column if not exists assistant_name text,
  add column if not exists assistant_contact text,
  add column if not exists important_dates text,

  -- Outcomes & engagement (counts derive from introductions/bookings)
  add column if not exists success_stories text,
  add column if not exists member_testimonial text,
  add column if not exists member_satisfaction_score numeric,
  add column if not exists nps_score integer,

  -- AI relationship intelligence (populated by AI later)
  add column if not exists churn_risk_score numeric,
  add column if not exists upgrade_potential numeric,
  add column if not exists engagement_score numeric,
  add column if not exists ltv_forecast_pence integer,
  add column if not exists relationship_health_score numeric,
  add column if not exists relationship_capital_score numeric,
  add column if not exists ai_intelligence jsonb;
