CREATE POLICY "contact_attributions_tenant_select" ON public.contact_attributions
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
