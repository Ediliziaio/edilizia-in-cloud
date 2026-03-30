-- Super admin access
DROP POLICY IF EXISTS "scadenze_super_admin" ON public.scadenze;
CREATE POLICY "scadenze_super_admin" ON public.scadenze
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
