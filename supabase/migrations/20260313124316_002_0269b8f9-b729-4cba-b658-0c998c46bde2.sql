-- Indexes
CREATE INDEX idx_task_automation_rules_company ON public.task_automation_rules(company_id) WHERE is_active = true;
