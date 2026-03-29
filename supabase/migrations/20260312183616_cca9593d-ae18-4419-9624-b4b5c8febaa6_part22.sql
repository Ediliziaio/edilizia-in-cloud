CREATE POLICY "company_isolation" ON public.anagrafica_azienda
  FOR ALL USING (company_id = public.get_my_company_id());
