-- Only service role can manage the queue (edge functions use service_role)
DROP POLICY IF EXISTS "Service role manages automation queue" ON public.automation_queue;
CREATE POLICY "Service role manages automation queue"
  ON public.automation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
