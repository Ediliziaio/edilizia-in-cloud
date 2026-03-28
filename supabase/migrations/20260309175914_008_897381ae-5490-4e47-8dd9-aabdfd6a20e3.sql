CREATE POLICY "attribution_sessions_tenant_select" ON public.attribution_sessions
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
