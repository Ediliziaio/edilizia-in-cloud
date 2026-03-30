-- P2-07: Stima ore per task
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(4,1)
    CHECK (estimated_hours IS NULL OR (estimated_hours >= 0 AND estimated_hours <= 999));

COMMENT ON COLUMN public.tasks.estimated_hours IS 'Ore stimate per completare il task (es. 0.5, 1, 2.5)';
