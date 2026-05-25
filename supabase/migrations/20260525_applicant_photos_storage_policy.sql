-- Allow anonymous public uploads + reads inside the `content` bucket's
-- `applicants/` folder. Used by the membership-application form so an
-- unauthenticated applicant can attach a profile photo.
--
-- Scoped to the applicants/ prefix on purpose — every other content
-- bucket folder (heroes, gallery, etc.) stays admin-only.

DO $$
BEGIN
  -- Public INSERT — applicants can upload their own photo
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public insert applicant photos'
  ) THEN
    CREATE POLICY "Public insert applicant photos"
      ON storage.objects FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        bucket_id = 'content'
        AND (storage.foldername(name))[1] = 'applicants'
      );
  END IF;

  -- Public SELECT — needed so the public-URL preview works after upload
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read applicant photos'
  ) THEN
    CREATE POLICY "Public read applicant photos"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (
        bucket_id = 'content'
        AND (storage.foldername(name))[1] = 'applicants'
      );
  END IF;
END $$;
