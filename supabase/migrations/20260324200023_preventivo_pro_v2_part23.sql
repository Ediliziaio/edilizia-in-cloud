DROP POLICY IF EXISTS "pi_company" ON public.preventivo_impostazioni;
CREATE POLICY "pi_company" ON public.preventivo_impostazioni FOR ALL
  USING (company_id = public.get_my_company_id());
