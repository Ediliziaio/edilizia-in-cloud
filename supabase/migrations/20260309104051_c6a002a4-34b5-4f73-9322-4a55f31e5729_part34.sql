DROP POLICY IF EXISTS "qi_upd" ON public.quote_items;
CREATE POLICY "qi_upd" ON public.quote_items FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
