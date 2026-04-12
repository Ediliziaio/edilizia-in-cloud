-- Permetti agli operai/subappaltatori di leggere i propri appuntamenti assegnati
CREATE POLICY "appointments_campo_select_assigned"
  ON appointments FOR SELECT
  USING (assigned_to = auth.uid());
