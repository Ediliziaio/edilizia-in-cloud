CREATE POLICY "Company admins can manage contact field values"
  ON public.marketing_contact_field_values FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.marketing_contacts mc WHERE mc.id = marketing_contact_field_values.contact_id AND mc.company_id = get_user_company_id(auth.uid())
  ));
