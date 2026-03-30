DROP POLICY IF EXISTS "q_del" ON public.quotes;
CREATE POLICY "q_del" ON public.quotes FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
