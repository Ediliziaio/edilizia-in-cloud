-- Solo super_admin possono leggere
DROP POLICY IF EXISTS "Super admins can read stripe events" ON public.stripe_events_log;
CREATE POLICY "Super admins can read stripe events"
  ON public.stripe_events_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
