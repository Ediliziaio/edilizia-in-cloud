CREATE POLICY "Super admins can manage all email folders"
  ON public.email_folders FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
