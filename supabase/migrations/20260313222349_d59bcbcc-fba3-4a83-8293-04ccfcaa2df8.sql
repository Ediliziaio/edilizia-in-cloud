
-- Add UPDATE and DELETE RLS policies on automation_flow_versions
CREATE POLICY "Users can update own company versions"
  ON public.automation_flow_versions FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "Users can delete own company versions"
  ON public.automation_flow_versions FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
