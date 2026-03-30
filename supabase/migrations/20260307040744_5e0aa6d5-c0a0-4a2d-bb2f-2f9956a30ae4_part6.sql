DROP POLICY IF EXISTS "ai_agents_tenant_delete" ON public.ai_agents;
CREATE POLICY "ai_agents_tenant_delete" ON public.ai_agents
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
