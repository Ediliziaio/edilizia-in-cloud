-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_company_branding_company_id ON public.company_branding(company_id);
