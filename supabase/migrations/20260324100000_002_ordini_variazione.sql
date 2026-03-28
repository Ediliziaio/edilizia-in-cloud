CREATE POLICY "company_access_odv" ON public.ordini_variazione FOR ALL
  USING (company_id = public.get_my_company_id());
