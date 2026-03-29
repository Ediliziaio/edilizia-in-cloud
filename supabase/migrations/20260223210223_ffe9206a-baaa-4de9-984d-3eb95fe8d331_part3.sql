CREATE POLICY "Users can insert own company folders" ON public.automation_folders
  FOR INSERT WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
