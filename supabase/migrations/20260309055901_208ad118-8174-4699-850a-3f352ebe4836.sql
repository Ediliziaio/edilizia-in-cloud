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

-- Fix 1b: Add WITH CHECK to super_admin policy too
ALTER POLICY "Super admins can manage all staff permissions"
  ON public.staff_permissions
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 4: Add can_view_users column
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_users boolean NOT NULL DEFAULT false;