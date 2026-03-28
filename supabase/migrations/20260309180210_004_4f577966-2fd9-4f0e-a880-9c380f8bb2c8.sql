CREATE POLICY "lead_forms_tenant_all" ON public.lead_forms
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
