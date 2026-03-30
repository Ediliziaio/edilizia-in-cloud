DROP POLICY IF EXISTS "Users can view own company sync jobs" ON public.integration_sync_jobs;
CREATE POLICY "Users can view own company sync jobs"
  ON public.integration_sync_jobs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
