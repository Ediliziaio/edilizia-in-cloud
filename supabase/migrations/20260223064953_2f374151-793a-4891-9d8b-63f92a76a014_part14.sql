CREATE POLICY "Super admins can manage all email logs" ON public.email_logs FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
