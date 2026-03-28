CREATE INDEX IF NOT EXISTS idx_automation_log_rule ON public.automation_log(rule_id, created_at DESC);
