CREATE POLICY "Service role manages trigger events"
  ON public.automation_trigger_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
