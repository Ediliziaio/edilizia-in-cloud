DROP POLICY IF EXISTS "Super admins can manage all custom fields" ON public.marketing_custom_fields;
CREATE POLICY "Super admins can manage all custom fields"
  ON public.marketing_custom_fields FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
