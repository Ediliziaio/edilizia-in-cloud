-- ━━━ FASE 8.bis — pgvector embeddings su article_families e tariffe_aziendali ━━━
--
-- Estende il retrieval semantico (già attivo su article_templates via migration 07)
-- a famiglie e tariffe, così l'AI può proporre righe family-aware con misure+assi
-- e suggerire tariffe trasversali (posa, trasporto, smaltimento, sigillatura) in
-- base alla rilevanza semantica della descrizione lavori.

-- 1. Embedding columns
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.article_families.embedding IS
  'FASE 8.bis: embedding text-embedding-3-small (1536 dim) per retrieval semantico AI';
COMMENT ON COLUMN public.tariffe_aziendali.embedding IS
  'FASE 8.bis: embedding text-embedding-3-small (1536 dim) per retrieval semantico AI';

-- 2. HNSW indices (cosine)
CREATE INDEX IF NOT EXISTS idx_article_families_embedding_hnsw
  ON public.article_families
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tariffe_aziendali_embedding_hnsw
  ON public.tariffe_aziendali
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- 3. RPC match_families_semantic — top-K famiglie per company_id
CREATE OR REPLACE FUNCTION public.match_families_semantic(
  p_query_embedding vector(1536),
  p_company_id UUID,
  p_vertical TEXT DEFAULT NULL,
  p_match_threshold FLOAT DEFAULT 0.25,
  p_match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  descrizione TEXT,
  categoria_id UUID,
  modalita_prezzo_base TEXT,
  unit_of_measure TEXT,
  prezzo_base_vendita NUMERIC,
  posa_tariffa_default_id UUID,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.nome,
    f.descrizione,
    f.categoria_id,
    f.modalita_prezzo_base,
    f.unit_of_measure,
    f.prezzo_base_vendita,
    f.posa_tariffa_default_id,
    1 - (f.embedding <=> p_query_embedding) AS similarity
  FROM public.article_families f
  WHERE f.company_id = p_company_id
    AND f.attivo = true
    AND f.embedding IS NOT NULL
    AND (p_vertical IS NULL OR f.vertical = p_vertical)
    AND (1 - (f.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY f.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.match_families_semantic IS
  'FASE 8.bis: retrieval semantico famiglie articolo. RLS ereditata da invoker.';

-- 4. RPC match_tariffe_semantic — top-K tariffe per company_id
CREATE OR REPLACE FUNCTION public.match_tariffe_semantic(
  p_query_embedding vector(1536),
  p_company_id UUID,
  p_vertical TEXT DEFAULT NULL,
  p_match_threshold FLOAT DEFAULT 0.20,
  p_match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  tipo TEXT,
  prezzo_vendita NUMERIC,
  costo_interno NUMERIC,
  unita TEXT,
  unita_fatturazione TEXT,
  vertical_associato TEXT,
  piano_base INT,
  prezzo_piano_aggiuntivo NUMERIC,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.nome,
    t.tipo,
    t.prezzo_vendita,
    t.costo_interno,
    t.unita,
    t.unita_fatturazione,
    t.vertical_associato,
    t.piano_base,
    t.prezzo_piano_aggiuntivo,
    1 - (t.embedding <=> p_query_embedding) AS similarity
  FROM public.tariffe_aziendali t
  WHERE t.company_id = p_company_id
    AND t.attiva = true
    AND t.embedding IS NOT NULL
    AND (p_vertical IS NULL OR t.vertical_associato = p_vertical OR t.vertical_associato IS NULL)
    AND (1 - (t.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY t.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.match_tariffe_semantic IS
  'FASE 8.bis: retrieval semantico tariffe (filtra per vertical o globali). RLS da invoker.';
