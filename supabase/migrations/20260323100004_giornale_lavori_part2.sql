DROP POLICY IF EXISTS "company_access_giornale" ON public.giornale_lavori;
CREATE POLICY "company_access_giornale" ON public.giornale_lavori FOR ALL
  USING (company_id = public.get_my_company_id());
