DROP POLICY IF EXISTS "lg_company" ON public.listino_griglia;
CREATE POLICY "lg_company" ON public.listino_griglia FOR ALL
  USING (company_id = public.get_my_company_id());
