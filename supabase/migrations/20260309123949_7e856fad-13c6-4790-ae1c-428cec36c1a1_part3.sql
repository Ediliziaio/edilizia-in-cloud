DROP POLICY IF EXISTS "super_admins_manage_addons_log" ON public.company_addons_log;
CREATE POLICY "super_admins_manage_addons_log"
ON public.company_addons_log FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
