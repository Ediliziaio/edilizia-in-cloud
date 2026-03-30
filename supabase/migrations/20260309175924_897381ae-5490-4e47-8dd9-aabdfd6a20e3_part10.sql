-- Allow service_role insert (for edge function)
DROP POLICY IF EXISTS "attribution_sessions_service_insert" ON public.attribution_sessions;
CREATE POLICY "attribution_sessions_service_insert" ON public.attribution_sessions
  FOR INSERT TO service_role
  WITH CHECK (true);
