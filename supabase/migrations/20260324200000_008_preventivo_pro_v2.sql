CREATE POLICY "ta_company" ON public.tariffe_aziendali FOR ALL
  USING (company_id = public.get_my_company_id());
