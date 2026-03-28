CREATE INDEX idx_task_automation_rules_trigger ON public.task_automation_rules(trigger_type) WHERE is_active = true;
