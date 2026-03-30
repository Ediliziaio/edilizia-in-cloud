DROP POLICY IF EXISTS "Users can manage checklist items for their company tasks" ON public.task_checklist_items;
CREATE POLICY "Users can manage checklist items for their company tasks"
  ON public.task_checklist_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.profiles p ON p.company_id = t.company_id
      WHERE t.id = task_checklist_items.task_id AND p.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.profiles p ON p.company_id = t.company_id
      WHERE t.id = task_checklist_items.task_id AND p.id = auth.uid()
    )
  );
