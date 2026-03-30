CREATE INDEX IF NOT EXISTS idx_automation_execution_log_flow ON public.automation_execution_log(flow_id, created_at DESC);
