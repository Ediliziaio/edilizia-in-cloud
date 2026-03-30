DROP POLICY IF EXISTS "hr_timbrature_super_admin" ON public.hr_timbrature;
CREATE POLICY "hr_timbrature_super_admin" ON public.hr_timbrature FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
