CREATE POLICY "perm_templates_delete"
  ON public.permission_templates FOR DELETE TO authenticated
  USING (
    (company_id = public.get_my_company_id() AND is_system_default = FALSE
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );
