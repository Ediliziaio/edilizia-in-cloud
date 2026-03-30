DROP POLICY IF EXISTS "Super admins full access sms_logs" ON public.sms_logs;
CREATE POLICY "Super admins full access sms_logs"
  ON public.sms_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
