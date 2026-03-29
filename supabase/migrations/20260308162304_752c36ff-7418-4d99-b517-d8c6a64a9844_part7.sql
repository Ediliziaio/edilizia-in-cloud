CREATE POLICY "Service role only for reminders"
  ON public.appointment_reminders_sent FOR ALL
  TO authenticated
  USING (false);
