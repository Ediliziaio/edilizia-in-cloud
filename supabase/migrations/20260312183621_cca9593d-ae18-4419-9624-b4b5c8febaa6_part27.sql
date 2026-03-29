CREATE POLICY "company_isolation" ON public.sdi_log
  FOR ALL USING (company_id = public.get_my_company_id());
