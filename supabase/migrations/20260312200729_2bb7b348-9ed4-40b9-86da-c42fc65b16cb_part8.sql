DROP POLICY IF EXISTS "hr_festivita_own_company" ON public.hr_festivita;
CREATE POLICY "hr_festivita_own_company" ON public.hr_festivita FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
