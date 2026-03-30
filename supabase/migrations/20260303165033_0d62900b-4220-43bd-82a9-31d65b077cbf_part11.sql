DROP POLICY IF EXISTS "Users can manage own preferences" ON public.reporting_preferences;
CREATE POLICY "Users can manage own preferences"
  ON public.reporting_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
