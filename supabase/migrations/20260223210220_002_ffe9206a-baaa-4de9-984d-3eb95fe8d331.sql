-- RLS policies
CREATE POLICY "Users can view own company folders" ON public.automation_folders
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()));
