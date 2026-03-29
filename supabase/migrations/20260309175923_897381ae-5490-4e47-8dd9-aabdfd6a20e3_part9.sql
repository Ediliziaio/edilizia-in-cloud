CREATE POLICY "attribution_sessions_tenant_insert" ON public.attribution_sessions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
