-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_rules_company ON public.automation_rules(company_id) WHERE attiva = true;
