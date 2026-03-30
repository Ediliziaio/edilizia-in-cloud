DROP POLICY IF EXISTS "Users can insert comments" ON public.task_comments;
CREATE POLICY "Users can insert comments"
  ON public.task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.profiles p ON p.company_id = t.company_id
      WHERE t.id = task_comments.task_id AND p.id = auth.uid()
    )
  );
