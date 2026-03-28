CREATE INDEX IF NOT EXISTS idx_user_audit_log_company ON public.user_audit_log(company_id, created_at DESC);
