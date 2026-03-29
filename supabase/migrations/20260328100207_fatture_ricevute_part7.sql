CREATE POLICY "fatture_ricevute_company_isolation"
  ON public.fatture_ricevute
  FOR ALL
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
