CREATE POLICY "q_upd" ON public.quotes FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
