DROP POLICY IF EXISTS "ta_super_admin" ON public.tariffe_aziendali;
CREATE POLICY "ta_super_admin" ON public.tariffe_aziendali FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
