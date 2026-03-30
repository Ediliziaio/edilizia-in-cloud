DROP POLICY IF EXISTS "login_attempts_insert_own" ON public.login_attempts;
CREATE POLICY "login_attempts_insert_own" ON public.login_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NOT NULL 
    AND user_id = auth.uid()
  );
