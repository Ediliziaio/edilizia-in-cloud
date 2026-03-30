CREATE INDEX IF NOT EXISTS idx_api_usage_daily_key ON public.api_usage_daily(api_key_id, date DESC);
