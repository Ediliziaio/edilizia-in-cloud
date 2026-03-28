CREATE POLICY "Company members can view alert prefs" ON public.scadenza_alert_prefs
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
