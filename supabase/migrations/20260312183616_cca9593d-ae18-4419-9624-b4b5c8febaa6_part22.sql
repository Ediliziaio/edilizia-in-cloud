DROP POLICY IF EXISTS "company_isolation" ON public.anagrafica_azienda;
CREATE POLICY "company_isolation" ON public.anagrafica_azienda
  FOR ALL USING (company_id = public.get_my_company_id());
