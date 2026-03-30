-- P3-05: Dipendenze tra task

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  task_id       UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_id),
  CONSTRAINT no_self_dependency CHECK (task_id <> depends_on_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id       ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON public.task_dependencies(depends_on_id);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_dependencies_policy"
  ON public.task_dependencies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_dependencies.task_id
        AND t.company_id = get_user_company_id(auth.uid())
    )
  );
