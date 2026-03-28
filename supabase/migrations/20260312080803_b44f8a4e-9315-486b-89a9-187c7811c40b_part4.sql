CREATE POLICY "admin_own_sessions_delete"
  ON public.admin_sessions FOR DELETE
  USING (user_id = auth.uid());
