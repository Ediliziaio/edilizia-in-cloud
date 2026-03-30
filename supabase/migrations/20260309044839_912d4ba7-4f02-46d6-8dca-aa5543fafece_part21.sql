DROP POLICY IF EXISTS "perm_templates_insert" ON public.permission_templates;
CREATE POLICY "perm_templates_insert"
  ON public.permission_templates FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );
