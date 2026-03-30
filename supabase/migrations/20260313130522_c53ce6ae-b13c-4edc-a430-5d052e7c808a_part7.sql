DROP POLICY IF EXISTS "Users can delete own comments" ON public.task_comments;
CREATE POLICY "Users can delete own comments"
  ON public.task_comments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
