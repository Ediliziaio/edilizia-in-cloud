CREATE POLICY "company_isolation" ON public.documenti_fiscali
  FOR ALL USING (company_id = public.get_my_company_id());
