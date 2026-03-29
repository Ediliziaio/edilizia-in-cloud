-- Credentials only accessible via service role (edge functions), no client-side access
CREATE POLICY "No direct client access to credentials"
  ON public.integration_credentials FOR SELECT TO authenticated
  USING (false);
