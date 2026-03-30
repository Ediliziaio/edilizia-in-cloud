DROP POLICY IF EXISTS "Users manage own read status" ON public.ticket_read_status;
CREATE POLICY "Users manage own read status" ON public.ticket_read_status
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
