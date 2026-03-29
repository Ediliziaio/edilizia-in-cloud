CREATE POLICY "hr_sedi_own_company" ON public.hr_sedi FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
