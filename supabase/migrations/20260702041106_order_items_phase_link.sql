-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.order_work_phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_phase ON public.order_items(phase_id);
