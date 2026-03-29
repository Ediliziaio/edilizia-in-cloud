CREATE POLICY "Users can view comments for their company tasks"
  ON public.task_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.profiles p ON p.company_id = t.company_id
      WHERE t.id = task_comments.task_id AND p.id = auth.uid()
    )
  );
