CREATE POLICY "super_admin_company_tags_delete" ON public.company_tags
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
