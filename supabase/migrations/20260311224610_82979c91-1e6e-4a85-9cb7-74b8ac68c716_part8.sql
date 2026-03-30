DROP POLICY IF EXISTS "company_webhooks" ON public.webhooks;
CREATE POLICY "company_webhooks" ON webhooks
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );
