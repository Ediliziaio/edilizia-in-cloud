-- Solo super_admin possono leggere
CREATE POLICY "Super admins can read stripe events"
  ON public.stripe_events_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
