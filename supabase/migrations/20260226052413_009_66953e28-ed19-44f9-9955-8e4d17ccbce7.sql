CREATE POLICY "Users manage own google settings"
  ON public.google_calendar_settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
