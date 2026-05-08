-- ═══════════════════════════════════════════════════════════════════════════
-- KB IMPROVEMENTS — Foundation
-- -----------------------------------------------------------------------
-- Implementa 10 dei 12 miglioramenti identificati nell'audit dal POV LLM:
--   1. Versioning  → last_verified_at, valid_until, replaces_doc_id
--   2. Q&A pairs    → tabella ai_kb_qa_pairs + RPC test runner
--   3. Anti-patterns → colonna anti_patterns jsonb
--   4. Citation chunk_id → campo chunk_id (univoco per chunk, citato dall'LLM)
--   5. Hierarchy    → category_path (es. "fiscale/iva/liquidazione")
--   6. Embedding model versioning → embedding_model + embedding_dim
--   7. Test playground → RPC kb_test_query (frontend la chiama)
--   8. Quality alerts → view v_kb_quality_alerts
--   9. Token budget → view v_kb_token_budget
--  10. RPC kb_run_qa_tests → esegue tutti i Q&A test e ritorna risultati
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ALTER ai_brain_documents — versioning + hierarchy + anti-patterns
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_brain_documents
  -- Versioning: quando il fatto è stato verificato e fino a quando vale
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replaces_doc_id UUID
    REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,

  -- Citation: chunk_id univoco per permettere all'LLM di citare il chunk esatto
  -- (formato [chunk:abc123] invece del semplice [S1])
  ADD COLUMN IF NOT EXISTS chunk_id TEXT
    DEFAULT (substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),

  -- Hierarchy: category_path tipo "fiscale/iva/liquidazione" per filtering pre-vector
  ADD COLUMN IF NOT EXISTS category_path TEXT,

  -- Anti-patterns: regole "se domanda contiene X, NON rispondere Y"
  -- Formato: [{"if_query_contains": ["pec obbligatoria"], "do_not_say": ["non obbligatoria"], "reason": "abolizione 2024"}]
  ADD COLUMN IF NOT EXISTS anti_patterns JSONB DEFAULT '[]'::jsonb,

  -- Embedding versioning: quale modello ha generato l'embedding
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_dim INT DEFAULT 1536,

  -- Quality: average similarity score quando viene retrievato (rolling)
  ADD COLUMN IF NOT EXISTS avg_retrieval_similarity NUMERIC(4,3);

-- Backfill chunk_id per i record esistenti (deve essere univoco)
UPDATE public.ai_brain_documents
SET chunk_id = substring(replace(id::text, '-', ''), 1, 8)
WHERE chunk_id IS NULL OR chunk_id = '';

-- Backfill category_path da category esistente (default "uncategorized")
UPDATE public.ai_brain_documents
SET category_path = COALESCE(category, 'uncategorized')
WHERE category_path IS NULL;

-- Index su category_path per filtering veloce pre-vector-search
CREATE INDEX IF NOT EXISTS idx_kb_category_path
  ON public.ai_brain_documents (category_path)
  WHERE deleted_at IS NULL;

-- Index su validity per filtrare docs scaduti
CREATE INDEX IF NOT EXISTS idx_kb_valid_until
  ON public.ai_brain_documents (valid_until)
  WHERE valid_until IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.ai_brain_documents.last_verified_at IS
  'Quando questo fatto è stato verificato l''ultima volta. NULL = mai verificato.';
COMMENT ON COLUMN public.ai_brain_documents.valid_until IS
  'Scadenza fattuale (es. "aliquota 2026" valid_until 2026-12-31). Dopo, l''LLM avvisa "info potenzialmente obsoleta".';
COMMENT ON COLUMN public.ai_brain_documents.replaces_doc_id IS
  'Doc che questo sostituisce. Permette query "info aggiornata" via ricorsione.';
COMMENT ON COLUMN public.ai_brain_documents.chunk_id IS
  'ID univoco breve (8 char) usato dall''LLM nelle citazioni: [chunk:abc12345].';
COMMENT ON COLUMN public.ai_brain_documents.category_path IS
  'Path gerarchico tipo "fiscale/iva/liquidazione". Permette filtering pre-vector.';
COMMENT ON COLUMN public.ai_brain_documents.anti_patterns IS
  'Regole anti-hallucination: [{"if_query_contains":["x"],"do_not_say":["y"],"reason":"..."}].';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. TABELLA ai_kb_qa_pairs — Ground truth per regression testing
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_kb_qa_pairs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question              TEXT NOT NULL,
  expected_answer       TEXT NOT NULL,
  -- Doc IDs che la risposta DEVE citare (almeno uno)
  must_cite_doc_ids     UUID[] DEFAULT '{}',
  -- Frasi che la risposta NON deve contenere (anti-hallucination test)
  forbidden_phrases     TEXT[] DEFAULT '{}',
  -- Categoria del Q&A per organizzare (es. "fiscale", "preventivi")
  category              TEXT,
  -- Tags liberi per filter
  tags                  TEXT[] DEFAULT '{}',
  -- Soglia minima similarity per considerare il test passato
  min_similarity        NUMERIC(4,3) DEFAULT 0.30,
  -- Stato: stale=last_run >7gg, ok=passed, ko=failed, never_run
  last_status           TEXT DEFAULT 'never_run' CHECK (last_status IN ('never_run', 'ok', 'ko', 'stale', 'error')),
  last_run_at           TIMESTAMPTZ,
  last_run_details      JSONB,
  -- Metadata audit
  enabled               BOOLEAN DEFAULT true,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_kb_qa_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qa_pairs_super_admin_all" ON public.ai_kb_qa_pairs;
CREATE POLICY "qa_pairs_super_admin_all" ON public.ai_kb_qa_pairs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "qa_pairs_service_all" ON public.ai_kb_qa_pairs;
CREATE POLICY "qa_pairs_service_all" ON public.ai_kb_qa_pairs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_qa_pairs_status
  ON public.ai_kb_qa_pairs (last_status)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_qa_pairs_category
  ON public.ai_kb_qa_pairs (category)
  WHERE enabled = true;

CREATE OR REPLACE FUNCTION public.fn_qa_pairs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_qa_pairs_updated_at ON public.ai_kb_qa_pairs;
CREATE TRIGGER trg_qa_pairs_updated_at
  BEFORE UPDATE ON public.ai_kb_qa_pairs
  FOR EACH ROW EXECUTE FUNCTION public.fn_qa_pairs_updated_at();

COMMENT ON TABLE public.ai_kb_qa_pairs IS
  'Ground truth Q&A pairs per regression testing della KB. Quando modifichi un doc, esegui i test per verificare che le risposte attese siano ancora corrette.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RPC kb_test_query — Playground: testa una query e ritorna chunks + meta
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kb_test_query(
  p_query           TEXT,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_top_k           INT DEFAULT 5,
  p_min_similarity  NUMERIC DEFAULT 0.20,
  p_category_path   TEXT DEFAULT NULL,
  p_company_id      UUID DEFAULT NULL,
  p_include_expired BOOLEAN DEFAULT false
)
RETURNS TABLE (
  chunk_id              TEXT,
  doc_id                UUID,
  title                 TEXT,
  category              TEXT,
  category_path         TEXT,
  content_preview       TEXT,
  similarity            NUMERIC,
  hits_count            INT,
  last_used_at          TIMESTAMPTZ,
  last_verified_at      TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,
  is_expired            BOOLEAN,
  replaces_doc_id       UUID,
  embedding_model       TEXT,
  anti_patterns_count   INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super BOOLEAN;
BEGIN
  -- Solo super_admin (queries possono ritornare contenuti sensibili)
  v_is_super := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Permesso negato: solo super_admin' USING ERRCODE = '42501';
  END IF;

  -- Se non passato l'embedding, non possiamo fare vector search
  -- → ritorniamo solo full-text match su content/title
  IF p_query_embedding IS NULL THEN
    RETURN QUERY
    SELECT
      d.chunk_id,
      d.id AS doc_id,
      d.title,
      d.category,
      d.category_path,
      LEFT(d.content, 300) AS content_preview,
      0::NUMERIC AS similarity,
      d.hits_count,
      d.last_used_at,
      d.last_verified_at,
      d.valid_until,
      (d.valid_until IS NOT NULL AND d.valid_until < now()) AS is_expired,
      d.replaces_doc_id,
      d.embedding_model,
      jsonb_array_length(COALESCE(d.anti_patterns, '[]'::jsonb)) AS anti_patterns_count
    FROM public.ai_brain_documents d
    WHERE d.deleted_at IS NULL
      AND (p_company_id IS NULL OR d.company_id = p_company_id OR d.scope = 'universal')
      AND (p_category_path IS NULL OR d.category_path LIKE p_category_path || '%')
      AND (p_include_expired OR d.valid_until IS NULL OR d.valid_until > now())
      AND (
        d.title ILIKE '%' || p_query || '%'
        OR d.content ILIKE '%' || p_query || '%'
      )
    ORDER BY d.hits_count DESC NULLS LAST
    LIMIT p_top_k;
    RETURN;
  END IF;

  -- Vector search con embedding fornito
  RETURN QUERY
  SELECT
    d.chunk_id,
    d.id AS doc_id,
    d.title,
    d.category,
    d.category_path,
    LEFT(d.content, 300) AS content_preview,
    (1 - (d.embedding <=> p_query_embedding))::NUMERIC AS similarity,
    d.hits_count,
    d.last_used_at,
    d.last_verified_at,
    d.valid_until,
    (d.valid_until IS NOT NULL AND d.valid_until < now()) AS is_expired,
    d.replaces_doc_id,
    d.embedding_model,
    jsonb_array_length(COALESCE(d.anti_patterns, '[]'::jsonb)) AS anti_patterns_count
  FROM public.ai_brain_documents d
  WHERE d.deleted_at IS NULL
    AND d.embedding IS NOT NULL
    AND (p_company_id IS NULL OR d.company_id = p_company_id OR d.scope = 'universal')
    AND (p_category_path IS NULL OR d.category_path LIKE p_category_path || '%')
    AND (p_include_expired OR d.valid_until IS NULL OR d.valid_until > now())
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kb_test_query(TEXT, vector, INT, NUMERIC, TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kb_test_query(TEXT, vector, INT, NUMERIC, TEXT, UUID, BOOLEAN) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. VIEW v_kb_quality_alerts — segnala chunks problematici
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_kb_quality_alerts AS
WITH base AS (
  SELECT
    id, chunk_id, title, category, category_path,
    LENGTH(content) AS content_length,
    hits_count,
    last_used_at,
    last_verified_at,
    valid_until,
    avg_retrieval_similarity,
    embedding_model,
    LENGTH(content) / 4 AS estimated_tokens,
    ingested_at,
    deleted_at
  FROM public.ai_brain_documents
  WHERE deleted_at IS NULL
)
SELECT
  id,
  chunk_id,
  title,
  category,
  category_path,
  content_length,
  estimated_tokens,
  -- Tipologia alert (può essercene più di uno per doc)
  CASE
    WHEN valid_until IS NOT NULL AND valid_until < now() THEN 'expired'
    WHEN last_verified_at IS NULL OR last_verified_at < now() - interval '180 days' THEN 'stale_unverified'
    WHEN hits_count = 0 AND ingested_at < now() - interval '30 days' THEN 'orphaned'
    WHEN content_length < 100 THEN 'too_short'
    WHEN content_length > 8000 THEN 'too_long'
    WHEN avg_retrieval_similarity IS NOT NULL AND avg_retrieval_similarity < 0.40 THEN 'low_similarity'
    ELSE 'ok'
  END AS alert_type,
  CASE
    WHEN valid_until IS NOT NULL AND valid_until < now() THEN 'critical'
    WHEN last_verified_at IS NULL OR last_verified_at < now() - interval '180 days' THEN 'warning'
    WHEN hits_count = 0 AND ingested_at < now() - interval '30 days' THEN 'info'
    WHEN content_length < 100 THEN 'warning'
    WHEN content_length > 8000 THEN 'warning'
    WHEN avg_retrieval_similarity IS NOT NULL AND avg_retrieval_similarity < 0.40 THEN 'warning'
    ELSE 'ok'
  END AS severity,
  hits_count,
  last_used_at,
  last_verified_at,
  valid_until,
  avg_retrieval_similarity
FROM base;

GRANT SELECT ON public.v_kb_quality_alerts TO authenticated;
GRANT SELECT ON public.v_kb_quality_alerts TO service_role;

COMMENT ON VIEW public.v_kb_quality_alerts IS
  'KB chunks con problemi: scaduti, non verificati >180gg, orfani >30gg, troppo corti/lunghi, similarity media bassa.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. VIEW v_kb_token_budget — dimensione e costo stimato
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_kb_token_budget AS
SELECT
  COALESCE(category, 'uncategorized') AS category,
  COUNT(*)                            AS n_docs,
  SUM(LENGTH(content))                AS total_chars,
  SUM(LENGTH(content) / 4)            AS estimated_tokens,
  -- Costo embedding per re-ingest completo (stima OpenAI text-embedding-3-small ~$0.02/1M token)
  ROUND((SUM(LENGTH(content) / 4) / 1000000.0 * 0.02)::NUMERIC, 4) AS reembed_cost_usd,
  -- Spazio storage stima (4 byte per dim float * 1536 dim per vector)
  ROUND((COUNT(*) * 1536 * 4 / 1024.0 / 1024.0)::NUMERIC, 2) AS embeddings_size_mb,
  AVG(hits_count)                     AS avg_hits,
  MAX(hits_count)                     AS max_hits,
  COUNT(*) FILTER (WHERE hits_count = 0) AS n_orphaned,
  COUNT(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until < now()) AS n_expired
FROM public.ai_brain_documents
WHERE deleted_at IS NULL
GROUP BY COALESCE(category, 'uncategorized')
ORDER BY estimated_tokens DESC;

GRANT SELECT ON public.v_kb_token_budget TO authenticated;
GRANT SELECT ON public.v_kb_token_budget TO service_role;

COMMENT ON VIEW public.v_kb_token_budget IS
  'KB size & embedding cost per categoria. Stima costo re-embed full e MB di storage embeddings.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6. RPC kb_run_qa_tests — esegue tutti i test Q&A attivi (fa retrieval +
-- valida che almeno uno dei must_cite_doc_ids sia nei top-k)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kb_run_qa_tests(
  p_qa_pair_id UUID DEFAULT NULL  -- NULL = run all enabled
)
RETURNS TABLE (
  qa_pair_id      UUID,
  question        TEXT,
  status          TEXT,        -- 'ok' | 'ko' | 'error'
  matched_doc_ids UUID[],
  expected_doc_ids UUID[],
  details         JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super BOOLEAN;
  v_qa       RECORD;
  v_matched  UUID[];
  v_status   TEXT;
  v_details  JSONB;
BEGIN
  v_is_super := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Permesso negato: solo super_admin' USING ERRCODE = '42501';
  END IF;

  FOR v_qa IN
    SELECT * FROM public.ai_kb_qa_pairs
    WHERE enabled = true
      AND (p_qa_pair_id IS NULL OR id = p_qa_pair_id)
  LOOP
    -- Senza embedding (la chiamata RPC non può embeddare): full-text fallback.
    -- Per il test "real", il frontend chiama l'edge function kb-qa-test-runner
    -- che PRIMA embedda la query, poi chiama kb_test_query con vector.
    SELECT array_agg(d.id) INTO v_matched
    FROM (
      SELECT id FROM public.ai_brain_documents
      WHERE deleted_at IS NULL
        AND (
          title ILIKE '%' || v_qa.question || '%'
          OR content ILIKE '%' || v_qa.question || '%'
        )
      ORDER BY hits_count DESC NULLS LAST
      LIMIT 5
    ) d;

    v_matched := COALESCE(v_matched, '{}');

    -- Pass se almeno un must_cite è nei matched (o se must_cite è vuoto, sempre pass)
    IF array_length(v_qa.must_cite_doc_ids, 1) IS NULL
       OR array_length(v_qa.must_cite_doc_ids, 1) = 0 THEN
      v_status := 'ok';
    ELSIF v_matched && v_qa.must_cite_doc_ids THEN
      v_status := 'ok';
    ELSE
      v_status := 'ko';
    END IF;

    v_details := jsonb_build_object(
      'matched_count', COALESCE(array_length(v_matched, 1), 0),
      'expected_count', COALESCE(array_length(v_qa.must_cite_doc_ids, 1), 0),
      'method', 'fulltext_fallback_no_embedding',
      'note', 'Per test con embedding reale, chiamare edge function kb-qa-test-runner'
    );

    -- Aggiorna stato del Q&A pair
    UPDATE public.ai_kb_qa_pairs
    SET last_status      = v_status,
        last_run_at      = now(),
        last_run_details = v_details
    WHERE id = v_qa.id;

    -- Yield risultato
    qa_pair_id := v_qa.id;
    question := v_qa.question;
    status := v_status;
    matched_doc_ids := v_matched;
    expected_doc_ids := v_qa.must_cite_doc_ids;
    details := v_details;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kb_run_qa_tests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kb_run_qa_tests(UUID) TO service_role;

COMMENT ON FUNCTION public.kb_run_qa_tests IS
  'Esegue Q&A regression tests. Versione "lite" full-text. Per test con embedding reale, edge function kb-qa-test-runner.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7. RPC update retrieval similarity — chiamata da ragInjector dopo retrieval
-- per tracciare la qualità media di retrieval di ogni chunk
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kb_track_retrieval(
  p_doc_id      UUID,
  p_similarity  NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_brain_documents
  SET
    hits_count = COALESCE(hits_count, 0) + 1,
    last_used_at = now(),
    -- Rolling avg con peso più alto sui valori recenti
    avg_retrieval_similarity = COALESCE(
      ROUND(((COALESCE(avg_retrieval_similarity, p_similarity) * 0.8 + p_similarity * 0.2))::NUMERIC, 3),
      ROUND(p_similarity::NUMERIC, 3)
    )
  WHERE id = p_doc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kb_track_retrieval(UUID, NUMERIC) TO service_role;

COMMIT;
