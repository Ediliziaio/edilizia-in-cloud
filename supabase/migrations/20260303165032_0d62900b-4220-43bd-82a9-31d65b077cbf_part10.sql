DROP POLICY IF EXISTS "Users can view own preferences" ON public.reporting_preferences;
CREATE POLICY "Users can view own preferences"
  ON public.reporting_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
