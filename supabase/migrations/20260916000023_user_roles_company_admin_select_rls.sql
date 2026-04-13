-- Allow company_admin to view roles of users in their company.
-- Previously only super_admin and the user themselves could see roles,
-- which caused UsersConfig to show only the current admin.
CREATE POLICY "company_admin_view_company_user_roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
      AND p.company_id = public.get_user_company_id(auth.uid())
    )
  );
