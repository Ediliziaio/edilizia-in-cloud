-- Indexes for domain lookups
CREATE INDEX IF NOT EXISTS idx_company_branding_subdomain ON company_branding(subdomain) WHERE subdomain IS NOT NULL;
