CREATE POLICY "hr_giornate_own_company" ON public.hr_giornate FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
