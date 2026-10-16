-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge colonne di match al listino su computo_voci_estratte
-- Populate da computo-ai-extract edge function durante STEP 7.5
-- L'utente può poi cambiare/sovrascrivere dal ComputoPreviewEditor UI
-- ════════════════════════════════════════════════════════════════════════════

-- La fondazione del computo arriva nel 20260915000001.
DO $computo_dependency$
BEGIN
 IF to_regclass('public.computo_voci_estratte') IS NOT NULL THEN
ALTER TABLE public.computo_voci_estratte
  ADD COLUMN IF NOT EXISTS matched_template_id uuid,
  ADD COLUMN IF NOT EXISTS matched_family_id uuid,
  ADD COLUMN IF NOT EXISTS matched_tariffa_id uuid,
  ADD COLUMN IF NOT EXISTS matched_name text,
  ADD COLUMN IF NOT EXISTS match_type text
    CHECK (match_type IN ('alias', 'vector', 'manual', 'none')),
  ADD COLUMN IF NOT EXISTS match_confidence numeric;

COMMENT ON COLUMN public.computo_voci_estratte.matched_template_id IS
  'FK verso article_templates — popolato automaticamente da pgvector o manualmente dall''utente.';
COMMENT ON COLUMN public.computo_voci_estratte.matched_family_id IS
  'FK verso families (configuratore) — popolato automaticamente da pgvector o manualmente.';
COMMENT ON COLUMN public.computo_voci_estratte.matched_name IS
  'Nome del prodotto del listino abbinato (cache display).';
COMMENT ON COLUMN public.computo_voci_estratte.match_type IS
  'alias=lookup deterministico product_aliases, vector=pgvector similarity, manual=utente, none=non trovato.';
COMMENT ON COLUMN public.computo_voci_estratte.match_confidence IS
  'Score di similarità del match (0-1). 1.0 per alias esatti, <1 per vector.';
 END IF;
END $computo_dependency$;
