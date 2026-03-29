CREATE POLICY "qi_ins" ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
