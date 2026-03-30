-- P3-06: Template task predefiniti

CREATE TABLE IF NOT EXISTS public.task_templates (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  notes            TEXT,
  priority         TEXT        NOT NULL DEFAULT 'normale',
  category         TEXT        NOT NULL DEFAULT 'generale',
  estimated_hours  NUMERIC(4,1),
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_task_templates_company_id ON public.task_templates(company_id);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_templates_company_policy"
  ON public.task_templates FOR ALL
  USING (company_id = get_user_company_id(auth.uid()));
