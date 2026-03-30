DROP POLICY IF EXISTS "Super admins can manage all email billing" ON public.email_billing;
CREATE POLICY "Super admins can manage all email billing" ON public.email_billing FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
