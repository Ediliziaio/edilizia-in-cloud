CREATE POLICY "login_attempts_insert_service" ON public.login_attempts
  FOR INSERT TO service_role
  WITH CHECK (true);
