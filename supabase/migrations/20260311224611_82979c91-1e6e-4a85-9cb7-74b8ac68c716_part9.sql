DROP POLICY IF EXISTS "company_webhook_deliveries" ON public.webhook_deliveries;
CREATE POLICY "company_webhook_deliveries" ON webhook_deliveries
  FOR ALL USING (
    webhook_id IN (
      SELECT w.id FROM webhooks w
      JOIN profiles p ON p.id = auth.uid()
      WHERE w.company_id = p.company_id
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
