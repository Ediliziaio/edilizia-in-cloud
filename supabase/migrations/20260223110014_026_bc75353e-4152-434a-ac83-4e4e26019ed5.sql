CREATE POLICY "Company admins can view their automation execution logs"
  ON public.automation_execution_log FOR SELECT
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
