-- Public read policy for active branding (needed for unauthenticated login page)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'company_branding' AND policyname = 'public_read_active_branding'
  ) THEN
    CREATE POLICY "public_read_active_branding" ON company_branding
      FOR SELECT TO anon, authenticated
      USING (is_active = true);
  END IF;
END $$;
