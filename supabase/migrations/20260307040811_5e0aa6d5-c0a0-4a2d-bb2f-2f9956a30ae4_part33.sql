DROP POLICY IF EXISTS "ai_audit_tenant_select" ON public.ai_agent_audit_log;
CREATE POLICY "ai_audit_tenant_select" ON public.ai_agent_audit_log
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
