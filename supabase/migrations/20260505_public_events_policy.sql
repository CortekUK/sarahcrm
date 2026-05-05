-- Allow anonymous (unauthenticated) users to view published events
-- Required for the public /events page which uses the anon key via server components
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events'
      AND policyname = 'Public can view published events'
  ) THEN
    CREATE POLICY "Public can view published events"
      ON events
      FOR SELECT
      TO anon
      USING (status = 'published');
  END IF;
END
$$;
