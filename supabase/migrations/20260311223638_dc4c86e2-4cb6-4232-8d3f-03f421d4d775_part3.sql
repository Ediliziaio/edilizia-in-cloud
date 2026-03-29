CREATE POLICY "company_access_cal_prefs" ON user_calendar_preferences
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );
