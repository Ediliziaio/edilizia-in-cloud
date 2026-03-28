CREATE POLICY "int_campaigns_tenant_select" ON public.internal_outbound_campaigns
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
