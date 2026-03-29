CREATE POLICY "perm_templates_select"
  ON public.permission_templates FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR is_system_default = TRUE
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
