CREATE POLICY "System manages busy slots"
  ON public.google_calendar_busy_slots FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
