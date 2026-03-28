CREATE INDEX idx_api_usage_log_company ON public.api_usage_log(company_id, created_at DESC);
