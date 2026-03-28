-- Fix 1: Add WITH CHECK to company_admin policy to prevent cross-tenant writes
ALTER POLICY "Company admins can manage staff permissions"
  ON public.staff_permissions
  USING (
    has_role(auth.uid(), 'company_admin'::app_role) AND
    company_id = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'company_admin'::app_role) AND
    company_id = get_user_company_id(auth.uid())
  );
