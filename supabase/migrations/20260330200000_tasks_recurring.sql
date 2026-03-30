-- P1-03: Task ricorrenti
-- Aggiunge colonne per la gestione della ripetizione automatica dei task

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_recurring      BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule   TEXT      CHECK (recurrence_rule IN ('daily','weekly','biweekly','monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS parent_task_id    UUID      REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_recurring   ON public.tasks(is_recurring) WHERE is_recurring = true;

COMMENT ON COLUMN public.tasks.is_recurring       IS 'Task con ripetizione automatica';
COMMENT ON COLUMN public.tasks.recurrence_rule    IS 'Regola ripetizione: daily|weekly|biweekly|monthly';
COMMENT ON COLUMN public.tasks.recurrence_end_date IS 'Data fine ripetizione (opzionale)';
COMMENT ON COLUMN public.tasks.parent_task_id     IS 'Task padre da cui è stato generato (ricorrenza)';
