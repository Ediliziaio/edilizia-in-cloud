-- Super admin: accesso completo a tutti i dati
CREATE POLICY "lcat_super_admin" ON public.listino_categorie FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
