CREATE POLICY "Company members can update own branches"
  ON public.ai_agent_branches FOR UPDATE
  TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
