-- P2-03: Etichette / Tag personalizzati per task

-- Tabella etichette azienda
CREATE TABLE IF NOT EXISTS public.task_tags (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

-- Relazione many-to-many task ↔ tag
CREATE TABLE IF NOT EXISTS public.task_tag_assignments (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES public.task_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_task_tag_assignments_tag_id  ON public.task_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_task_tag_assignments_task_id ON public.task_tag_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_company_id         ON public.task_tags(company_id);

-- RLS
ALTER TABLE public.task_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tag_assignments  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_tags_company_policy"
  ON public.task_tags FOR ALL
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "task_tag_assignments_policy"
  ON public.task_tag_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_tag_assignments.task_id
        AND t.company_id = get_user_company_id(auth.uid())
    )
  );
