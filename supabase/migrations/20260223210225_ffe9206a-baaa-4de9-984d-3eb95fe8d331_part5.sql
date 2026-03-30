DROP POLICY IF EXISTS "Users can delete own company folders" ON public.automation_folders;
CREATE POLICY "Users can delete own company folders" ON public.automation_folders
  FOR DELETE USING (company_id = public.get_user_company_id(auth.uid()));
