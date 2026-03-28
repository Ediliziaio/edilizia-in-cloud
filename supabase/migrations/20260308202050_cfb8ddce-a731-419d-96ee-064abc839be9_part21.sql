CREATE POLICY "int_actions_tenant_select" ON public.internal_agent_actions
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
