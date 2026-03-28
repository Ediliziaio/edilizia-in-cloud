-- Fix 1b: Add WITH CHECK to super_admin policy too
ALTER POLICY "Super admins can manage all staff permissions"
  ON public.staff_permissions
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
