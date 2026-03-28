CREATE INDEX IF NOT EXISTS idx_automation_templates ON public.automation_rules(categoria) WHERE is_template = true;
