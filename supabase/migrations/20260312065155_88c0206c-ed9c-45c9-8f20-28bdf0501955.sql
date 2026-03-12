
-- Add missing columns for domain management and white-label activation
ALTER TABLE company_branding
  ADD COLUMN IF NOT EXISTS subdomain text UNIQUE,
  ADD COLUMN IF NOT EXISTS custom_domain_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_domain_cname text,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_name text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- Indexes for domain lookups
CREATE INDEX IF NOT EXISTS idx_company_branding_subdomain ON company_branding(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_branding_custom_domain ON company_branding(custom_domain) WHERE custom_domain IS NOT NULL;

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
