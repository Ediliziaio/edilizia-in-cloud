-- ━━━ FASE 8.1 — pgvector + embeddings su article_templates ━━━
--
-- Abilita retrieval semantico dei prodotti catalogo tramite cosine similarity
-- su embedding (OpenAI text-embedding-3-small, 1536 dim).
-- Sostituisce il LIMIT 60 hardcoded nell'edge function AI.

-- 1. Estensione pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Colonna embedding su article_templates
ALTER TABLE public.article_templates
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.article_templates.embedding IS
  'FASE 8: embedding OpenAI text-embedding-3-small (1536 dim) per retrieval semantico AI';
COMMENT ON COLUMN public.article_templates.embedding_updated_at IS
  'FASE 8: timestamp ultima generazione embedding — NULL se mai generato';

-- 3. Indice HNSW cosine (faster than ivfflat per dataset piccoli/medi)
CREATE INDEX IF NOT EXISTS idx_article_templates_embedding_hnsw
  ON public.article_templates
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- 4. RPC retrieval: top-K prodotti per company_id ordinati per similarità
--    Parametri:
--      p_query_embedding — embedding della descrizione lavori
--      p_company_id      — scope azienda corrente (obbligatorio per RLS)
--      p_match_threshold — soglia minima similarità (0 = tutto, 1 = identico). default 0.25
--      p_match_count     — numero max risultati. default 40
CREATE OR REPLACE FUNCTION public.match_articles(
  p_query_embedding vector(1536),
  p_company_id UUID,
  p_match_threshold FLOAT DEFAULT 0.25,
  p_match_count INT DEFAULT 40
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  sku TEXT,
  modalita_prezzo TEXT,
  prezzo_vendita NUMERIC,
  prezzo_acquisto_netto NUMERIC,
  unit_of_measure TEXT,
  ha_montaggio BOOLEAN,
  montaggio_tipo TEXT,
  categoria_id UUID,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    at.id,
    at.name,
    at.sku,
    at.modalita_prezzo,
    at.prezzo_vendita,
    at.prezzo_acquisto_netto,
    at.unit_of_measure,
    at.ha_montaggio,
    at.montaggio_tipo,
    at.categoria_id,
    1 - (at.embedding <=> p_query_embedding) AS similarity
  FROM public.article_templates at
  WHERE at.company_id = p_company_id
    AND at.embedding IS NOT NULL
    AND (1 - (at.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY at.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.match_articles IS
  'FASE 8: retrieval semantico prodotti via cosine similarity su embedding. RLS ereditata dall''invoker su article_templates.';
