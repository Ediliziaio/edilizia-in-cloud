DROP POLICY IF EXISTS "super_admin_full_access" ON public.multi_company_access;
CREATE POLICY "super_admin_full_access" ON public.multi_company_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
