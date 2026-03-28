CREATE POLICY "Company admins can manage alert prefs" ON public.scadenza_alert_prefs
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
