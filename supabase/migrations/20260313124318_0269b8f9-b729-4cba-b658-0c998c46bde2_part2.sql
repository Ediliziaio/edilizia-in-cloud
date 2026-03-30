-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_automation_rules_company ON public.task_automation_rules(company_id) WHERE is_active = true;
