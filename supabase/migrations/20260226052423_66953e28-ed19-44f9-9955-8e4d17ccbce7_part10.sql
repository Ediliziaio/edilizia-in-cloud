DROP POLICY IF EXISTS "Super admins full access google settings" ON public.google_calendar_settings;
CREATE POLICY "Super admins full access google settings"
  ON public.google_calendar_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
