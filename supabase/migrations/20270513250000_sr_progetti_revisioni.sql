-- ════════════════════════════════════════════════════════════════════════════
-- sr_progetti.parent_id — supporto revisioni preventivo
-- ────────────────────────────────────────────────────────────────────────────
-- USE CASE
-- "Il cliente vuole 3 offerte (base / medio / premium)" — oppure dopo un
-- sopralluogo il commerciale modifica il preventivo creando una nuova
-- versione. Senza versioning: si sovrascrive o si crea un nuovo preventivo
-- scollegato → impossibile ricostruire la storia delle offerte.
--
-- MODELLO
--   parent_id → FK opzionale a sr_progetti(id):
--     • NULL    = preventivo "originale" (revision_number = 1)
--     • <uuid>  = revisione di quel parent
--   revision_number → INTEGER 1..N, calcolato lato app al momento del
--     duplicate (count parent's children + 1)
--
-- BACKWARD COMPAT
--   Tutte le righe esistenti hanno parent_id = NULL (originali). Indici
--   parziali per query efficienti su "tutte le revisioni di X".
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_progetti
  ADD COLUMN IF NOT EXISTS parent_id UUID
    REFERENCES public.sr_progetti(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

-- Indice per query "tutte le revisioni di un preventivo"
CREATE INDEX IF NOT EXISTS idx_sr_progetti_parent
  ON public.sr_progetti (parent_id)
  WHERE parent_id IS NOT NULL;

COMMENT ON COLUMN public.sr_progetti.parent_id IS
  'FK opzionale: se valorizzato, questo progetto è una revisione del parent. '
  'NULL = preventivo originale.';
COMMENT ON COLUMN public.sr_progetti.revision_number IS
  'Numero progressivo della revisione (1 = originale, 2 = prima revisione, …). '
  'Calcolato lato app al momento del duplicate.';

NOTIFY pgrst, 'reload schema';
