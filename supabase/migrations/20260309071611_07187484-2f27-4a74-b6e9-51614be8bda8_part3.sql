-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_company ON public.api_keys(company_id);
