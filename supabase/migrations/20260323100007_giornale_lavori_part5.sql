CREATE POLICY "company_access_giornale_foto" ON public.giornale_foto FOR ALL
  USING (company_id = public.get_my_company_id());
