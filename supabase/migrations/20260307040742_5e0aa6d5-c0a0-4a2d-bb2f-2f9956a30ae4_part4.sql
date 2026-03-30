DROP POLICY IF EXISTS "ai_agents_tenant_insert" ON public.ai_agents;
CREATE POLICY "ai_agents_tenant_insert" ON public.ai_agents
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
