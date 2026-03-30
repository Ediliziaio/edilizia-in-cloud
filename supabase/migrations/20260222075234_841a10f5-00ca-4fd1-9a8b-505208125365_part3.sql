DROP POLICY IF EXISTS "Company admins can manage their custom fields" ON public.marketing_custom_fields;
CREATE POLICY "Company admins can manage their custom fields"
  ON public.marketing_custom_fields FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
