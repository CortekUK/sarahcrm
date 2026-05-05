-- ============================================================
-- WEBSITE CONTENT TABLES
-- For the public-facing website of The Club by Sarah Restrick
--
-- NOTE: Tables were initially created via Supabase dashboard.
-- This migration is idempotent — safe to re-run.
-- Column names match the actual remote schema.
-- ============================================================

-- Hero images/slides for various pages
CREATE TABLE IF NOT EXISTS hero_slides (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_slug text NOT NULL DEFAULT 'home',
  image_url text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  overlay_text text,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Partner/sponsor logos
CREATE TABLE IF NOT EXISTS partner_logos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  image_url text NOT NULL,
  website_url text,
  display_order int DEFAULT 0,
  is_visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Testimonials
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  person_name text NOT NULL,
  person_title text,
  company_name text,
  quote_text text NOT NULL,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Gallery entries (event galleries)
CREATE TABLE IF NOT EXISTS galleries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  cover_image_url text,
  event_date date,
  venue_name text,
  location text,
  category text,
  is_published boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Gallery photos
CREATE TABLE IF NOT EXISTS gallery_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id uuid REFERENCES galleries(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  caption text,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Curated experiences (Private Event Services page)
CREATE TABLE IF NOT EXISTS curated_experiences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  image_url text,
  link_url text,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Video gallery (YouTube embeds)
CREATE TABLE IF NOT EXISTS video_gallery (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  youtube_url text NOT NULL,
  page_slug text NOT NULL DEFAULT 'about',
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Mailing list signups
CREATE TABLE IF NOT EXISTS mailing_list (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  source text DEFAULT 'website',
  subscribed boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- General enquiries (contact form)
CREATE TABLE IF NOT EXISTS enquiries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  position text,
  intent text[],
  message text NOT NULL,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Membership applications
CREATE TABLE IF NOT EXISTS membership_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  position text,
  linkedin_url text,
  preferred_tier text DEFAULT 'individual',
  preferred_location text,
  industry text,
  referral_source text,
  referral_name text,
  bio text,
  interests text[],
  status text DEFAULT 'pending',
  notes text,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Documents (PDF brochures, etc.)
CREATE TABLE IF NOT EXISTS documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text NOT NULL DEFAULT '',
  file_url text NOT NULL,
  page_slug text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE hero_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE curated_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailing_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES (idempotent — wrapped in IF NOT EXISTS)
-- ============================================================

DO $$ BEGIN
  -- Public read policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hero_slides' AND policyname='Public read hero_slides') THEN
    CREATE POLICY "Public read hero_slides" ON hero_slides FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_logos' AND policyname='Public read partner_logos') THEN
    CREATE POLICY "Public read partner_logos" ON partner_logos FOR SELECT USING (is_visible = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='testimonials' AND policyname='Public read testimonials') THEN
    CREATE POLICY "Public read testimonials" ON testimonials FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='galleries' AND policyname='Public read galleries') THEN
    CREATE POLICY "Public read galleries" ON galleries FOR SELECT USING (is_published = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gallery_photos' AND policyname='Public read gallery_photos') THEN
    CREATE POLICY "Public read gallery_photos" ON gallery_photos FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='curated_experiences' AND policyname='Public read curated_experiences') THEN
    CREATE POLICY "Public read curated_experiences" ON curated_experiences FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_gallery' AND policyname='Public read video_gallery') THEN
    CREATE POLICY "Public read video_gallery" ON video_gallery FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='documents' AND policyname='Public read documents') THEN
    CREATE POLICY "Public read documents" ON documents FOR SELECT USING (is_active = true);
  END IF;

  -- Public insert for forms
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mailing_list' AND policyname='Public insert mailing_list') THEN
    CREATE POLICY "Public insert mailing_list" ON mailing_list FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enquiries' AND policyname='Public insert enquiries') THEN
    CREATE POLICY "Public insert enquiries" ON enquiries FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='membership_applications' AND policyname='Public insert membership_applications') THEN
    CREATE POLICY "Public insert membership_applications" ON membership_applications FOR INSERT WITH CHECK (true);
  END IF;

  -- Admin full access (service role handles this, but also for authenticated admins)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hero_slides' AND policyname='Admin all hero_slides') THEN
    CREATE POLICY "Admin all hero_slides" ON hero_slides FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_logos' AND policyname='Admin all partner_logos') THEN
    CREATE POLICY "Admin all partner_logos" ON partner_logos FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='testimonials' AND policyname='Admin all testimonials') THEN
    CREATE POLICY "Admin all testimonials" ON testimonials FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='galleries' AND policyname='Admin all galleries') THEN
    CREATE POLICY "Admin all galleries" ON galleries FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gallery_photos' AND policyname='Admin all gallery_photos') THEN
    CREATE POLICY "Admin all gallery_photos" ON gallery_photos FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='curated_experiences' AND policyname='Admin all curated_experiences') THEN
    CREATE POLICY "Admin all curated_experiences" ON curated_experiences FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_gallery' AND policyname='Admin all video_gallery') THEN
    CREATE POLICY "Admin all video_gallery" ON video_gallery FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mailing_list' AND policyname='Admin all mailing_list') THEN
    CREATE POLICY "Admin all mailing_list" ON mailing_list FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enquiries' AND policyname='Admin all enquiries') THEN
    CREATE POLICY "Admin all enquiries" ON enquiries FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='membership_applications' AND policyname='Admin all membership_applications') THEN
    CREATE POLICY "Admin all membership_applications" ON membership_applications FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='documents' AND policyname='Admin all documents') THEN
    CREATE POLICY "Admin all documents" ON documents FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;
