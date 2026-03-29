CREATE POLICY "Users can update own company folders" ON public.automation_folders
  FOR UPDATE USING (company_id = public.get_user_company_id(auth.uid()));
