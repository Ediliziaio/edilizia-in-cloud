CREATE POLICY "Super admins can manage their own impersonations"
ON public.active_impersonations
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) AND admin_user_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) AND admin_user_id = auth.uid());
