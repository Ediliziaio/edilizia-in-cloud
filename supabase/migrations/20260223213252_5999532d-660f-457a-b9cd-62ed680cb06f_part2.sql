CREATE POLICY "Company can manage own global automation settings"
  ON public.automation_global_settings FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
