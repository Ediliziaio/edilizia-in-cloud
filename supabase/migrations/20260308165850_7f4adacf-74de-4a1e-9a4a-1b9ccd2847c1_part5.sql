DROP POLICY IF EXISTS "Company members can view own branches" ON public.ai_agent_branches;
CREATE POLICY "Company members can view own branches"
  ON public.ai_agent_branches FOR SELECT
  TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
