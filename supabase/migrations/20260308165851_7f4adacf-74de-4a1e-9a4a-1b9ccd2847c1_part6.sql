CREATE POLICY "Company members can insert own branches"
  ON public.ai_agent_branches FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
