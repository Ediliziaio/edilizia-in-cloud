DROP POLICY IF EXISTS "Super admins manage lifecycle notifications" ON public.lifecycle_notifications;
CREATE POLICY "Super admins manage lifecycle notifications"
ON public.lifecycle_notifications FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));
