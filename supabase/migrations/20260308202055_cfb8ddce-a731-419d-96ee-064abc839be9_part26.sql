DROP POLICY IF EXISTS "int_campaigns_tenant_update" ON public.internal_outbound_campaigns;
CREATE POLICY "int_campaigns_tenant_update" ON public.internal_outbound_campaigns
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
