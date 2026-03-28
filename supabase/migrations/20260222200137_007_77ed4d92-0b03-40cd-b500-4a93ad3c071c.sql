CREATE POLICY "Company admins can manage their calendar availability"
  ON public.marketing_calendar_availability FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
