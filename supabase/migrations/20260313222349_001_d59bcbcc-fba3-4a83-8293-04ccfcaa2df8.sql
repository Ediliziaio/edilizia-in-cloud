CREATE POLICY "Users can delete own company versions"
  ON public.automation_flow_versions FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
