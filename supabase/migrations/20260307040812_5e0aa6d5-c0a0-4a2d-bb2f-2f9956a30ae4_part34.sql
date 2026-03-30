DROP POLICY IF EXISTS "ai_audit_super_admin" ON public.ai_agent_audit_log;
CREATE POLICY "ai_audit_super_admin" ON public.ai_agent_audit_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
