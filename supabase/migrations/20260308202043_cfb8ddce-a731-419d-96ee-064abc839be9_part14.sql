CREATE POLICY "int_agents_tenant_insert" ON public.internal_ai_agents
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
