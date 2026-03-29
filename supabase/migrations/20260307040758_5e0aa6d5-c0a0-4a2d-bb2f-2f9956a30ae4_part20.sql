CREATE POLICY "ai_convos_tenant_insert" ON public.ai_agent_conversations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
