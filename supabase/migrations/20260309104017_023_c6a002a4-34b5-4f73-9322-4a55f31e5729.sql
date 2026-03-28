CREATE POLICY "q_sel" ON public.quotes FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
