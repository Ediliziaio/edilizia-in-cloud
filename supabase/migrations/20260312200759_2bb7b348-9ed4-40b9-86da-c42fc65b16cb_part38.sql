DROP POLICY IF EXISTS "hr_richieste_own_company" ON public.hr_richieste;
CREATE POLICY "hr_richieste_own_company" ON public.hr_richieste FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
