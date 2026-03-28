CREATE POLICY "Users can view own company integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
