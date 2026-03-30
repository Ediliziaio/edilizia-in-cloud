DROP POLICY IF EXISTS "hr_timbrature_own_company" ON public.hr_timbrature;
CREATE POLICY "hr_timbrature_own_company" ON public.hr_timbrature FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
