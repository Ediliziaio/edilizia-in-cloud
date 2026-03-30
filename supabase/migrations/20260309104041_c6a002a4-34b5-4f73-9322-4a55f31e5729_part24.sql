DROP POLICY IF EXISTS "q_ins" ON public.quotes;
CREATE POLICY "q_ins" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
