CREATE POLICY "user_sessions_insert_self"
  ON public.user_sessions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
