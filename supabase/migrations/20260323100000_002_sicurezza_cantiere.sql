CREATE POLICY "company_access_pos" ON public.pos_documents FOR ALL
  USING (company_id = public.get_my_company_id());
