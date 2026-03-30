DROP POLICY IF EXISTS "int_agents_tenant_delete" ON public.internal_ai_agents;
CREATE POLICY "int_agents_tenant_delete" ON public.internal_ai_agents
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
