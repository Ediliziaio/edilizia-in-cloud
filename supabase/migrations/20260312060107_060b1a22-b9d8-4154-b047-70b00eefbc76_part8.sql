DROP POLICY IF EXISTS "Super admins full access virtual_phone_numbers" ON public.virtual_phone_numbers;
CREATE POLICY "Super admins full access virtual_phone_numbers"
  ON public.virtual_phone_numbers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
