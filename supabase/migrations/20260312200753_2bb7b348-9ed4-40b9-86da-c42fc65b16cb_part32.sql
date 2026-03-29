CREATE POLICY "hr_giornate_super_admin" ON public.hr_giornate FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
