CREATE POLICY "super_admin_read_email_log"
  ON public.email_delivery_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );
