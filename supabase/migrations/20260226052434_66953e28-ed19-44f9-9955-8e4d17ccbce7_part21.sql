DROP POLICY IF EXISTS "Users read own busy slots" ON public.google_calendar_busy_slots;
CREATE POLICY "Users read own busy slots"
  ON public.google_calendar_busy_slots FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
