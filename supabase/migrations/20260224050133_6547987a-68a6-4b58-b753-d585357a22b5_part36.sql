-- No client-side write; only edge functions via service role
DROP POLICY IF EXISTS "No direct client write to webhook events" ON public.integration_webhook_events;
CREATE POLICY "No direct client write to webhook events"
  ON public.integration_webhook_events FOR INSERT TO authenticated
  WITH CHECK (false);
