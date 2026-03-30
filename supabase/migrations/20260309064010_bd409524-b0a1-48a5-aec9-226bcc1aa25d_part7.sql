DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.platform_feature_flags;
CREATE POLICY "Authenticated users can read feature flags"
  ON public.platform_feature_flags FOR SELECT
  TO authenticated USING (true);
