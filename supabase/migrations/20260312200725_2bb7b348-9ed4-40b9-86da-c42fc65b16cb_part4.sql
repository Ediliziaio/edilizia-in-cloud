DROP POLICY IF EXISTS "hr_sedi_super_admin" ON public.hr_sedi;
CREATE POLICY "hr_sedi_super_admin" ON public.hr_sedi FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
