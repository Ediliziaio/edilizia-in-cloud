CREATE POLICY "Users can view own company field mappings"
  ON public.integration_field_mappings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
