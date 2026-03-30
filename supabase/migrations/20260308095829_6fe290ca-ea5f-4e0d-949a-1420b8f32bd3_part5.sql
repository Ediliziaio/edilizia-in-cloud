DROP POLICY IF EXISTS "Company users can insert broadcasts" ON public.whatsapp_broadcasts;
CREATE POLICY "Company users can insert broadcasts"
  ON whatsapp_broadcasts FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ));
