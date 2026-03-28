CREATE POLICY "Super admins can manage all email templates" ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
