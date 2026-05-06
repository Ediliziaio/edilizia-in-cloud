-- ════════════════════════════════════════════════════════════════════════════
-- MP-01 — Pre-RAG automatico: foundation
-- ════════════════════════════════════════════════════════════════════════════
-- Lo scope ('universal'|'company') su ai_brain_documents è già stato aggiunto
-- da migration 20260504320000_silvio_universal_kb_memory.sql.
-- Questa migration aggiunge SOLO ciò che manca:
--   1. RPC match_brain_universal — ricerca filtrata per kb_areas
--   2. Indice scope+area per query veloci
--   3. Colonne rag_sources + rag_min_similarity in silvio_decision_log
--   4. Colonne equivalenti in ai_persona_messages (per le 18 personas)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Indice ottimizzato per filtraggio area su scope=universal ────────
CREATE INDEX IF NOT EXISTS idx_brain_scope_universal_area
  ON public.ai_brain_documents (((metadata->>'area')))
  WHERE scope = 'universal' AND embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brain_scope_company
  ON public.ai_brain_documents (scope, company_id)
  WHERE scope = 'company';

-- ─── 2) RPC match_brain_universal ────────────────────────────────────────
-- Cerca chunk universali (KB filosofica/normativa/operativa) filtrabile per
-- aree specifiche della persona corrente (kb_areas_filter).
CREATE OR REPLACE FUNCTION public.match_brain_universal(
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 3,
  p_min_similarity numeric DEFAULT 0.30,
  p_kb_areas text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  area text,
  title text,
  content text,
  metadata jsonb,
  similarity numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.metadata->>'area' AS area,
    COALESCE(
      d.title,
      d.metadata->>'title',
      d.metadata->>'titolo',
      d.source_type
    ) AS title,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.ai_brain_documents d
  WHERE d.scope = 'universal'
    AND d.embedding IS NOT NULL
    AND (p_kb_areas IS NULL OR (d.metadata->>'area') = ANY(p_kb_areas))
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT GREATEST(LEAST(p_match_count, 10), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.match_brain_universal(vector, int, numeric, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.match_brain_universal(vector, int, numeric, text[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.match_brain_universal(vector, int, numeric, text[]) IS
  'MP-01: RAG sulla KB universale (Cervello Supremo). Filtrabile per kb_areas_filter della persona corrente.';

-- ─── 3) silvio_decision_log: campi audit RAG ────────────────────────────
ALTER TABLE public.silvio_decision_log
  ADD COLUMN IF NOT EXISTS rag_sources jsonb,
  ADD COLUMN IF NOT EXISTS rag_min_similarity numeric(4,3),
  ADD COLUMN IF NOT EXISTS rag_source_count int;

COMMENT ON COLUMN public.silvio_decision_log.rag_sources IS
  'MP-01: array delle fonti RAG iniettate nel system prompt (universal + company)';

-- ─── 4) ai_persona_messages: stessi campi per le 18 personas non-Silvio ─
-- (potrebbe non esistere, lo creo solo se la tabella esiste)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ai_persona_messages') THEN
    ALTER TABLE public.ai_persona_messages
      ADD COLUMN IF NOT EXISTS rag_sources jsonb,
      ADD COLUMN IF NOT EXISTS rag_min_similarity numeric(4,3),
      ADD COLUMN IF NOT EXISTS rag_source_count int;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ai_persona_messages alter skipped: %', SQLERRM;
END $$;

-- ─── 5) Sanity check finale ─────────────────────────────────────────────
DO $$
DECLARE
  v_universal_count int;
  v_universal_areas int;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT metadata->>'area')
    INTO v_universal_count, v_universal_areas
  FROM public.ai_brain_documents
  WHERE scope = 'universal' AND embedding IS NOT NULL;

  IF v_universal_count = 0 THEN
    RAISE WARNING 'MP-01: KB universale non popolata (0 chunk con scope=universal). Pre-RAG ritornerà context vuoto finché non esegui scripts/kb-ingestion/ingest-via-edge.ts';
  ELSE
    RAISE NOTICE 'MP-01 ok: % chunk universali su % aree distinte', v_universal_count, v_universal_areas;
  END IF;
END $$;
