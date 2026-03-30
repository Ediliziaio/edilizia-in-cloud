DROP POLICY IF EXISTS "Company admins can manage contact activities" ON public.marketing_contact_activities;
CREATE POLICY "Company admins can manage contact activities"
  ON public.marketing_contact_activities FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
