DROP POLICY IF EXISTS "Super admins can manage all contact field values" ON public.marketing_contact_field_values;
CREATE POLICY "Super admins can manage all contact field values"
  ON public.marketing_contact_field_values FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
