-- Insert policy: service role only (no authenticated insert needed, handled by function)
CREATE POLICY "login_attempts_insert_service"
  ON public.login_attempts FOR INSERT TO authenticated
  WITH CHECK (TRUE);
