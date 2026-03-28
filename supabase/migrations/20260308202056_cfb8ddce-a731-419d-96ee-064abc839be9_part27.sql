CREATE POLICY "int_campaigns_tenant_delete" ON public.internal_outbound_campaigns
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
