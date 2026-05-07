-- Add subscription tracking to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Membership tiers with pricing
CREATE TABLE membership_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier membership_tier NOT NULL,
  membership_type membership_type NOT NULL,
  name text NOT NULL,
  price_pence integer NOT NULL,
  billing_interval text NOT NULL DEFAULT 'month',
  stripe_product_id text,
  stripe_price_id text,
  intro_quota integer NOT NULL DEFAULT 3,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tier, membership_type, billing_interval)
);

-- Seed pricing data
INSERT INTO membership_tiers (tier, membership_type, name, price_pence, intro_quota) VALUES
  ('tier_1', 'individual', 'Individual Tier 1', 37500, 3),
  ('tier_2', 'individual', 'Individual Tier 2', 50000, 5),
  ('tier_3', 'individual', 'Individual Tier 3', 75000, 10),
  ('tier_1', 'business', 'Business Tier 1', 60000, 5),
  ('tier_2', 'business', 'Business Tier 2', 90000, 10),
  ('tier_3', 'business', 'Business Tier 3', 150000, -1);

-- Add stripe_invoice_id to payments for subscription payment tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

-- RLS for membership_tiers
ALTER TABLE membership_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage membership_tiers"
  ON membership_tiers FOR ALL
  USING (auth.jwt()->'app_metadata'->>'role' = 'admin');

CREATE POLICY "Authenticated users read membership_tiers"
  ON membership_tiers FOR SELECT
  USING (auth.role() = 'authenticated');
