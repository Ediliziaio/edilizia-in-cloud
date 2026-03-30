DROP POLICY IF EXISTS "Users can view own company versions" ON public.automation_flow_versions;
CREATE POLICY "Users can view own company versions"
  ON automation_flow_versions FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
