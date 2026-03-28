CREATE POLICY "hr_profili_super_admin" ON public.hr_profili FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
