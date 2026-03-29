CREATE POLICY "company_access_duvri" ON public.duvri_documents FOR ALL
  USING (company_id = public.get_my_company_id());
