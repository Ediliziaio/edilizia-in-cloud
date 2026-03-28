CREATE POLICY "hr_profili_own_company" ON public.hr_profili FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
