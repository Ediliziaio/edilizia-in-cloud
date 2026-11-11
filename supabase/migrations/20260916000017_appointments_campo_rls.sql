-- Permetti agli operai/subappaltatori di leggere i propri appuntamenti assegnati
DROP POLICY IF EXISTS "appointments_campo_select_assigned" ON appointments;
CREATE POLICY "appointments_campo_select_assigned"
  ON appointments FOR SELECT
  USING (assigned_to = auth.uid());
