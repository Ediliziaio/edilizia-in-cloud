DROP POLICY IF EXISTS "Super admins full access event map" ON public.google_calendar_event_map;
CREATE POLICY "Super admins full access event map"
  ON public.google_calendar_event_map FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
