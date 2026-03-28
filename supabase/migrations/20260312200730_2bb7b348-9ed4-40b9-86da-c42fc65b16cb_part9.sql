CREATE POLICY "hr_festivita_super_admin" ON public.hr_festivita FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
