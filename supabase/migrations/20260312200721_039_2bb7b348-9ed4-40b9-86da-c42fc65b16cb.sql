CREATE POLICY "hr_richieste_super_admin" ON public.hr_richieste FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
