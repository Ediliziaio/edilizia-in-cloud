DROP POLICY IF EXISTS "Super admins full access google connections" ON public.google_calendar_connections;
CREATE POLICY "Super admins full access google connections"
  ON public.google_calendar_connections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
