CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON public.automation_rules(trigger_tipo) WHERE attiva = true AND is_template = false;
