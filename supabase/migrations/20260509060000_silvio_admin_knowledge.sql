-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO ADMIN KNOWLEDGE — RAG per le 21 personas
-- -----------------------------------------------------------------------
-- Strategia: riusiamo `ai_brain_documents` (esistente con versioning,
-- qa_pairs, playground, ecc.) aggiungendo scope='silvio_admin'.
-- Il MEGA_CERVELLO_SUPERADMIN.md viene chunkato per area (21 aree mappate
-- alle personas) e ogni chunk ottiene metadata.persona = chi lo "possiede".
--
-- Aree del MEGA_CERVELLO:
--   00 — fondamenta (universale, tutte le personas)
--   01 — saas_metrics (beatrice, federico)
--   02 — strategie_crescita (federico, vittorio, marco)
--   03 — vendita_b2b_saas (marco)
--   04 — outbound_paid_acquisition (tommaso)
--   05 — marketing_brand (sofia)
--   06 — customer_success_retention (elena)
--   07 — support_risposte (giorgio)
--   08 — product_management (chiara)
--   09 — engineering_discipline (luca)
--   10 — security (davide)
--   11 — compliance_gdpr_aiact (eleonora)
--   12 — amministrazione_fiscale (roberta)
--   13 — strategic_frameworks (vittorio)
--   14 — edilizia_italiana (antonio)
--   15 — hr_people_ops (laura)
--   16 — ai_ml_applied (alessandro)
--   17 — data_analysis_sql (giulia)
--   18 — legal_b2b_saas (ferrari)
--   19 — devops_sre (matteo)
--   20 — partnerships_bd (gabriele)
--   21 — onboarding_cliente (valentina)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Estendi ai_brain_documents con campo persona_key (riferimento personas)
--    Già presente: scope, category, category_path, embedding, chunk_id, ecc.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_brain_documents
  ADD COLUMN IF NOT EXISTS persona_keys TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS kb_section TEXT,           -- es. '01-saas-metrics'
  ADD COLUMN IF NOT EXISTS kb_subsection TEXT;        -- es. '1.2-benchmark'

CREATE INDEX IF NOT EXISTS idx_brain_persona_keys
  ON public.ai_brain_documents USING gin(persona_keys)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_brain_kb_section
  ON public.ai_brain_documents(kb_section)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.ai_brain_documents.persona_keys IS
  'Quali personas Silvio Admin possono usare questo chunk. Vuoto = tutti.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC search_silvio_knowledge — vector search filtrato per persona
--    Usata dal tool search_knowledge dentro silvio-admin-chat.
-- ───────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.search_silvio_knowledge(vector, INT, NUMERIC, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.search_silvio_knowledge(
  p_query_embedding vector(1536),
  p_top_k           INT     DEFAULT 8,
  p_min_similarity  NUMERIC DEFAULT 0.30,
  p_persona_key     TEXT    DEFAULT NULL,    -- filtra per persona attiva
  p_kb_sections     TEXT[]  DEFAULT NULL     -- filtra per area (es. ARRAY['01-saas-metrics'])
)
RETURNS TABLE (
  doc_id           UUID,
  chunk_id         TEXT,
  title            TEXT,
  content          TEXT,
  kb_section       TEXT,
  kb_subsection    TEXT,
  persona_keys     TEXT[],
  source_path      TEXT,
  similarity       NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role TEXT;
BEGIN
  -- Auth: super_admin OR service_role (chiamato da edge function)
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' AND NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.chunk_id,
    d.title,
    d.content,
    d.kb_section,
    d.kb_subsection,
    d.persona_keys,
    d.source_path,
    (1 - (d.embedding <=> p_query_embedding))::NUMERIC AS similarity
  FROM public.ai_brain_documents d
  WHERE d.deleted_at IS NULL
    AND d.embedding IS NOT NULL
    AND d.scope = 'silvio_admin'
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
    -- Filtro per persona: se passata, prendi chunk con quella persona O senza filtro persona
    AND (
      p_persona_key IS NULL
      OR d.persona_keys = '{}'
      OR p_persona_key = ANY(d.persona_keys)
    )
    -- Filtro per area
    AND (p_kb_sections IS NULL OR d.kb_section = ANY(p_kb_sections))
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_silvio_knowledge(vector, INT, NUMERIC, TEXT, TEXT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_silvio_knowledge IS
  'Sprint C — Silvio Admin RAG: vector search filtrato per persona + area. Usato dal tool search_knowledge in silvio-admin-chat.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Helper: track citation (ogni volta che Silvio cita una fonte)
--    Permette di calcolare hits_count + last_used_at automatico.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_kb_track_citation(p_doc_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_doc_ids IS NULL OR array_length(p_doc_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ai_brain_documents
  SET hits_count = COALESCE(hits_count, 0) + 1,
      last_used_at = now()
  WHERE id = ANY(p_doc_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_kb_track_citation(UUID[]) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) View v_silvio_kb_stats — statistiche per area/persona
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_silvio_kb_stats AS
SELECT
  COALESCE(kb_section, 'unknown') AS kb_section,
  COUNT(*) AS n_chunks,
  SUM(LENGTH(content)) AS total_chars,
  ROUND(AVG(hits_count)) AS avg_hits,
  MAX(hits_count) AS max_hits,
  COUNT(*) FILTER (WHERE hits_count > 0) AS n_used,
  COUNT(*) FILTER (WHERE persona_keys <> '{}') AS n_persona_specific,
  ROUND(AVG(LENGTH(content))) AS avg_chunk_size_chars
FROM public.ai_brain_documents
WHERE deleted_at IS NULL
  AND scope = 'silvio_admin'
GROUP BY kb_section
ORDER BY kb_section;

GRANT SELECT ON public.v_silvio_kb_stats TO authenticated;

COMMIT;
