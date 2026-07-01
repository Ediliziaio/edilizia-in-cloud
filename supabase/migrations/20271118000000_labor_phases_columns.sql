-- Le fasi di lavorazione sono un RAGGRUPPAMENTO sopra le tabelle manodopera
-- esistenti (order_employees / order_external_teams), NON un sistema parallelo.
-- Così margine, dashboard, cashflow, app campo continuano a leggere gli stessi
-- dati senza modifiche. Le assegnazioni esistenti hanno phase_id = NULL
-- (gruppo "Senza fase"): nessuna migrazione dati, niente si perde.

-- Elimina la tabella parallela mai usata in produzione.
DROP TABLE IF EXISTS public.order_phase_assignments;

-- Colonne di raggruppamento/preventivo sulle tabelle manodopera esistenti.
ALTER TABLE public.order_employees
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.order_work_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_preventivo NUMERIC;

ALTER TABLE public.order_external_teams
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.order_work_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_preventivo NUMERIC;

CREATE INDEX IF NOT EXISTS idx_order_employees_phase ON public.order_employees(phase_id);
CREATE INDEX IF NOT EXISTS idx_order_external_teams_phase ON public.order_external_teams(phase_id);
