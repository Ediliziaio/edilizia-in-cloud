CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON public.call_logs(company_id, started_at);
