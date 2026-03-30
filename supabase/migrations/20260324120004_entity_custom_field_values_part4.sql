DROP POLICY IF EXISTS "company_access_entity_cfv" ON public.entity_custom_field_values;
CREATE POLICY "company_access_entity_cfv" ON public.entity_custom_field_values
  FOR ALL USING (company_id = public.get_my_company_id());
