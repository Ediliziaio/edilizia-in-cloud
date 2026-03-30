DROP POLICY IF EXISTS "contact_attributions_tenant_all" ON public.contact_attributions;
CREATE POLICY "contact_attributions_tenant_all" ON public.contact_attributions
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
