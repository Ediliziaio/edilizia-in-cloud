CREATE POLICY "Super admins manage overrides"
  ON public.company_feature_overrides FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
