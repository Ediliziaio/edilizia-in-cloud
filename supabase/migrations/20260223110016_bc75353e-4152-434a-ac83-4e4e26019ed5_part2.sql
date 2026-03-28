CREATE POLICY "Company admins can manage their automation flows"
  ON public.automation_flows FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
