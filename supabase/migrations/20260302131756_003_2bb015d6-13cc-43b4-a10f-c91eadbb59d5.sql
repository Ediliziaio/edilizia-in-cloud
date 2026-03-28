-- Only super_admin can manage company tags
CREATE POLICY "super_admin_company_tags_select" ON public.company_tags
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
