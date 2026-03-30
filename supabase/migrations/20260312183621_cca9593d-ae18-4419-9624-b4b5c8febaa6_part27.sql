DROP POLICY IF EXISTS "company_isolation" ON public.sdi_log;
CREATE POLICY "company_isolation" ON public.sdi_log
  FOR ALL USING (company_id = public.get_my_company_id());
