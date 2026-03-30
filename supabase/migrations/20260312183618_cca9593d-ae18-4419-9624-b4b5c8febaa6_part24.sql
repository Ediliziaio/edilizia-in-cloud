DROP POLICY IF EXISTS "company_isolation" ON public.articoli_native;
CREATE POLICY "company_isolation" ON public.articoli_native
  FOR ALL USING (company_id = public.get_my_company_id());
