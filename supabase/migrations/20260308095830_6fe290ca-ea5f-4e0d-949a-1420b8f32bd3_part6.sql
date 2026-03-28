-- Policies for whatsapp_broadcast_recipients
CREATE POLICY "Users can view recipients of their broadcasts"
  ON whatsapp_broadcast_recipients FOR SELECT TO authenticated
  USING (broadcast_id IN (
    SELECT wb.id FROM whatsapp_broadcasts wb
    WHERE wb.company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  ));
