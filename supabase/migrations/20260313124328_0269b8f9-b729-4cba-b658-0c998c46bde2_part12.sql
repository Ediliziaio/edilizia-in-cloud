CREATE POLICY "task_automation_log_insert" ON public.task_automation_log
  FOR INSERT TO authenticated
  WITH CHECK (true);
