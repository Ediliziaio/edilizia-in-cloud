DROP POLICY IF EXISTS "ai_agents_tenant_select" ON public.ai_agents;
CREATE POLICY "ai_agents_tenant_select" ON public.ai_agents
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
