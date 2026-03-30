DROP POLICY IF EXISTS "Super admins can manage all marketing documents" ON public.marketing_documents;
CREATE POLICY "Super admins can manage all marketing documents"
  ON public.marketing_documents FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));
