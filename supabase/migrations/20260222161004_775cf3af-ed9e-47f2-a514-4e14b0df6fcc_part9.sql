CREATE POLICY "Super admins can manage all contact lists"
  ON public.marketing_contact_lists FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
