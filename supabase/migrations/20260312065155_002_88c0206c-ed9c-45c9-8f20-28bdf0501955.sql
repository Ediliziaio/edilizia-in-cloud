CREATE INDEX IF NOT EXISTS idx_company_branding_custom_domain ON company_branding(custom_domain) WHERE custom_domain IS NOT NULL;
