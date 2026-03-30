-- Indexes
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_company ON public.gdpr_data_requests(company_id);
