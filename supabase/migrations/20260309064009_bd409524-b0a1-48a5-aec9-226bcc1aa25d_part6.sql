DROP POLICY IF EXISTS "Super admins manage feature flags" ON public.platform_feature_flags;
CREATE POLICY "Super admins manage feature flags"
  ON public.platform_feature_flags FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
