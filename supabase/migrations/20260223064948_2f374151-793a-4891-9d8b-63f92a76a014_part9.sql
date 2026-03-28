CREATE POLICY "Super admins can manage all email campaigns" ON public.email_campaigns FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
