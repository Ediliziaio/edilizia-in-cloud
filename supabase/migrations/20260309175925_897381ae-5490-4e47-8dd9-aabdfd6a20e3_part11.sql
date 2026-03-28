CREATE POLICY "attribution_sessions_service_select" ON public.attribution_sessions
  FOR SELECT TO service_role
  USING (true);
