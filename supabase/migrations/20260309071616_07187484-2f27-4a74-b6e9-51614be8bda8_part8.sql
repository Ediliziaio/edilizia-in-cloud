CREATE INDEX IF NOT EXISTS idx_api_usage_daily_company ON public.api_usage_daily(company_id, date DESC);
