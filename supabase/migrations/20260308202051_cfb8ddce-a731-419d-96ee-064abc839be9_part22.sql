DROP POLICY IF EXISTS "int_actions_tenant_insert" ON public.internal_agent_actions;
CREATE POLICY "int_actions_tenant_insert" ON public.internal_agent_actions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
