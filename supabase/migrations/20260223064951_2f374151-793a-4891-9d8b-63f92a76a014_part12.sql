DROP POLICY IF EXISTS "Company admins can manage their email logs" ON public.email_logs;
CREATE POLICY "Company admins can manage their email logs" ON public.email_logs FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
