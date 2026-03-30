DROP POLICY IF EXISTS "Super admins can manage IP allowlist" ON public.admin_ip_allowlist;
CREATE POLICY "Super admins can manage IP allowlist"
ON public.admin_ip_allowlist
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
