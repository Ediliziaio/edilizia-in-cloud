DROP POLICY IF EXISTS "Company admins can manage their automation connections" ON public.automation_connections;
CREATE POLICY "Company admins can manage their automation connections"
  ON public.automation_connections FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
