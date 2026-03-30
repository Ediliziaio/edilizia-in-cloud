DROP POLICY IF EXISTS "Company admins can manage their marketing calendars" ON public.marketing_calendars;
CREATE POLICY "Company admins can manage their marketing calendars"
  ON public.marketing_calendars FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
