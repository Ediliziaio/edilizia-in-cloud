-- Super admins can do everything
CREATE POLICY "Super admins can manage announcements"
ON public.platform_announcements
FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
