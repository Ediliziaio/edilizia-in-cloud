CREATE INDEX IF NOT EXISTS idx_automation_rules_categoria ON public.automation_rules(company_id, categoria) WHERE attiva = true;
