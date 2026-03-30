DROP POLICY IF EXISTS "Admins can manage own company sync jobs" ON public.integration_sync_jobs;
CREATE POLICY "Admins can manage own company sync jobs"
  ON public.integration_sync_jobs FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));
