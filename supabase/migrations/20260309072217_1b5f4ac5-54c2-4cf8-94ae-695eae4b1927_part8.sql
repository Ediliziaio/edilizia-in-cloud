CREATE INDEX IF NOT EXISTS idx_gdpr_audit_company ON public.gdpr_audit_log(company_id, created_at DESC);
