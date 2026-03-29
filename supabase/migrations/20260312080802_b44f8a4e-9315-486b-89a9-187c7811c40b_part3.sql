CREATE POLICY "admin_own_sessions_select"
  ON public.admin_sessions FOR SELECT
  USING (user_id = auth.uid());
