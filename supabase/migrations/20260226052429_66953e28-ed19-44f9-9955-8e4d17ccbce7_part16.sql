CREATE POLICY "Users manage own event mappings"
  ON public.google_calendar_event_map FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
