-- Allow service_role insert (for edge function)
CREATE POLICY "attribution_sessions_service_insert" ON public.attribution_sessions
  FOR INSERT TO service_role
  WITH CHECK (true);
