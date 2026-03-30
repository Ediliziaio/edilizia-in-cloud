CREATE INDEX IF NOT EXISTS idx_api_usage_log_key ON public.api_usage_log(api_key_id, created_at DESC);
