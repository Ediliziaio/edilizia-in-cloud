CREATE POLICY "lg_super_admin" ON public.listino_griglia FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
