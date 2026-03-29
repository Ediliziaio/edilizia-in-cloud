CREATE POLICY "Super admins can manage all contact notes"
  ON public.marketing_contact_notes FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
