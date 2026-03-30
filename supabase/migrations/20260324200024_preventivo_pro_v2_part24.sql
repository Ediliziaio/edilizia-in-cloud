DROP POLICY IF EXISTS "pi_super_admin" ON public.preventivo_impostazioni;
CREATE POLICY "pi_super_admin" ON public.preventivo_impostazioni FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
