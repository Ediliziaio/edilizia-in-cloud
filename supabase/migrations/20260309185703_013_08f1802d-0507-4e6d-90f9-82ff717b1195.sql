-- Super admin access
CREATE POLICY "scadenze_super_admin" ON public.scadenze
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
