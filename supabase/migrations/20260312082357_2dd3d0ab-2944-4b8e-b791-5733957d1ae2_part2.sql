CREATE POLICY "service_role_email_log"
  ON public.email_delivery_log FOR ALL
  USING (auth.role() = 'service_role');
