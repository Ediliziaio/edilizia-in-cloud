DROP POLICY IF EXISTS "qi_del" ON public.quote_items;
CREATE POLICY "qi_del" ON public.quote_items FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
