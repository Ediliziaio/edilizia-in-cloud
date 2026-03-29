CREATE POLICY "ai_credits_tenant_select" ON public.ai_agent_credits
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
