CREATE POLICY "super_admin_company_tags_insert" ON public.company_tags
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
