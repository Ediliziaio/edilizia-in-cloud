CREATE POLICY "prima_nota_super_admin" ON public.prima_nota_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
