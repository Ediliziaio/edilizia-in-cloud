-- Materiali per fase: un articolo della commessa può agganciarsi (opzionale)
-- a una fase lavorazione. Alimenta il blocco "Materiali della fase" in
-- OrderWorkPhases (pronto in magazzino / ordinato con OdA / da ordinare) e
-- gli OdA just-in-time per fase. NULL = "senza fase" (comportamento attuale).
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.order_work_phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_phase ON public.order_items(phase_id);
