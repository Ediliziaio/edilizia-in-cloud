
-- 1. Checklist items table
CREATE TABLE public.task_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

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

-- 2. Comments table
CREATE TABLE public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Users can delete own comments"
  ON public.task_comments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
