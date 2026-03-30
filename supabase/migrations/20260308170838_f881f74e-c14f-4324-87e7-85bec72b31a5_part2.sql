DROP POLICY IF EXISTS "Super admins can manage telnyx_settings" ON public.telnyx_settings;
CREATE POLICY "Super admins can manage telnyx_settings"
  ON public.telnyx_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
