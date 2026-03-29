CREATE POLICY "company_isolation" ON public.movimenti_cassa_native
  FOR ALL USING (company_id = public.get_my_company_id());
