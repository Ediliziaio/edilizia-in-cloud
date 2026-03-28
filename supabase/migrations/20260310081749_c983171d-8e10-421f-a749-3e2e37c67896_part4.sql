-- Fix RLS-enabled-no-policy: add policy for edge_function_rate_limits
CREATE POLICY "Service role only" ON public.edge_function_rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
