DROP POLICY IF EXISTS "Users can insert own company versions" ON public.automation_flow_versions;
CREATE POLICY "Users can insert own company versions"
  ON automation_flow_versions FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
