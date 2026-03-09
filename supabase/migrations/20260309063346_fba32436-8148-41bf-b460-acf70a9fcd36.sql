DROP POLICY IF EXISTS "Company admins can manage staff permissions" ON public.staff_permissions;

CREATE POLICY "Company admins can manage staff permissions"
  ON public.staff_permissions
  FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  );