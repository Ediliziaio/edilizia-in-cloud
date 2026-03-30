DROP POLICY IF EXISTS "Users manage own google connection" ON public.google_calendar_connections;
CREATE POLICY "Users manage own google connection"
  ON public.google_calendar_connections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
