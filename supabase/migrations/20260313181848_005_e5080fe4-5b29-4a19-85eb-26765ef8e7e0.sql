CREATE POLICY "Users can view own company execution runs"
  ON public.flow_execution_runs
  FOR SELECT
  TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    UNION
    SELECT mca.company_id FROM public.multi_company_access mca WHERE mca.user_id = auth.uid()
    UNION
    SELECT ai.target_company_id FROM public.active_impersonations ai WHERE ai.admin_user_id = auth.uid() AND ai.expires_at > now()
  ));
