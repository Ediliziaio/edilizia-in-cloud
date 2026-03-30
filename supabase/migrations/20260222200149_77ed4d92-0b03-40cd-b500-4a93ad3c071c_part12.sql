DROP POLICY IF EXISTS "Company admins can manage their calendar preferences" ON public.marketing_calendar_preferences;
CREATE POLICY "Company admins can manage their calendar preferences"
  ON public.marketing_calendar_preferences FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
