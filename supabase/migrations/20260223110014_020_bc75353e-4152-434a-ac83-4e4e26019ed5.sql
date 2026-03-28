CREATE POLICY "Company admins can manage their automation enrollments"
  ON public.automation_enrollments FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
