-- Extend membership_applications with the editorial 8-step flow.
-- These columns back the new public application form (Contact Details,
-- Location, Events Interest, Build Profile, Online Profiles, Business,
-- Membership tier, Payment preference).

ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS identifies_as text,
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS x_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS work_email text,
  ADD COLUMN IF NOT EXISTS annual_turnover text,
  ADD COLUMN IF NOT EXISTS employees text,
  ADD COLUMN IF NOT EXISTS payment_preference text;
