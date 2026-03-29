CREATE POLICY "ai_convos_tenant_select" ON public.ai_agent_conversations
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
