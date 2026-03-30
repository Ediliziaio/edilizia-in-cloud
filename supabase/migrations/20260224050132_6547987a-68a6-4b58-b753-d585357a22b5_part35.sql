DROP POLICY IF EXISTS "Users can view own company webhook events" ON public.integration_webhook_events;
CREATE POLICY "Users can view own company webhook events"
  ON public.integration_webhook_events FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
