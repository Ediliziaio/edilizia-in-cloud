DROP POLICY IF EXISTS "qi_sel" ON public.quote_items;
CREATE POLICY "qi_sel" ON public.quote_items FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
