-- P2-05: Ordinamento manuale task nella vista Lista
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Popola sort_order per task esistenti (ordine cronologico inverso = più recente prima)
UPDATE public.tasks
SET sort_order = EXTRACT(EPOCH FROM created_at)::INTEGER
WHERE sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON public.tasks(company_id, sort_order);

COMMENT ON COLUMN public.tasks.sort_order IS 'Ordinamento manuale nella vista lista (valore più basso = in alto)';
