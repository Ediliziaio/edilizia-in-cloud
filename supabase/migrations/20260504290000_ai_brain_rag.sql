-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-08 — AI Brain RAG: pgvector + ai_brain_documents
-- ════════════════════════════════════════════════════════════════════════════
-- Indicizza testi aziendali (descrizioni commesse, capitolati, note clienti,
-- chat passate) con embedding 1536-dim (OpenAI text-embedding-3-small) e
-- permette ricerca semantica via cosine similarity.
--
-- Architettura:
--   • ai_brain_documents: tabella documenti con embedding
--   • content_hash per idempotenza (re-ingest non duplica)
--   • Indice HNSW per cosine similarity O(log n)
--   • RLS: company-scoped + super_admin SELECT all
--   • RPC match_brain(company_id, embedding, limit, threshold)
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabella ai_brain_documents
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_brain_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  /** Tipo sorgente: 'order', 'customer', 'quote', 'invoice', 'employee', 'supplier', 'chat_summary', 'note' */
  source_type text NOT NULL,
  /** ID sorgente (es. order.id). NULL se non riferito a tabella specifica. */
  source_id uuid,

  /** Testo indicizzato (chunk). Max ~2000 char per chunk. */
  content text NOT NULL,
  /** Embedding 1536-dim (OpenAI text-embedding-3-small). NULL se ingest pending. */
  embedding vector(1536),

  /** Hash del contenuto (sha256 dei primi 8000 char). Per idempotenza. */
  content_hash text NOT NULL,

  /** Metadata varie: titolo, ruoli ammessi a vederlo, tag, ecc. */
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  /** Lingua (default 'it') — per filtering. */
  language text NOT NULL DEFAULT 'it',

  /** Roles che possono accedere a questo documento (RBAC granulare). NULL = tutti i ruoli aziendali. */
  visibility_roles text[],

  ingested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_brain_docs_company_source
  ON public.ai_brain_documents(company_id, source_type);
CREATE INDEX IF NOT EXISTS idx_brain_docs_source_id
  ON public.ai_brain_documents(company_id, source_type, source_id) WHERE source_id IS NOT NULL;
-- HNSW vector index (richiede pg 14+ con pgvector ≥ 0.5)
CREATE INDEX IF NOT EXISTS idx_brain_docs_embedding_hnsw
  ON public.ai_brain_documents USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
-- Unique per evitare duplicati: stesso source + hash → no re-insert
CREATE UNIQUE INDEX IF NOT EXISTS uq_brain_docs_dedup
  ON public.ai_brain_documents(company_id, source_type, COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid), content_hash);

ALTER TABLE public.ai_brain_documents ENABLE ROW LEVEL SECURITY;

-- Read: utente autenticato della stessa azienda
DROP POLICY IF EXISTS brain_docs_company_read ON public.ai_brain_documents;
CREATE POLICY brain_docs_company_read ON public.ai_brain_documents FOR SELECT
  USING (company_id = public.get_my_company_id());

-- SuperAdmin full access
DROP POLICY IF EXISTS brain_docs_admin ON public.ai_brain_documents;
CREATE POLICY brain_docs_admin ON public.ai_brain_documents FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_brain_docs_updated_at ON public.ai_brain_documents;
CREATE TRIGGER trg_brain_docs_updated_at
  BEFORE UPDATE ON public.ai_brain_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ai_brain_documents IS
  'Brain Aziendale: documenti aziendali indicizzati con embedding pgvector per RAG semantico.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Tabella ai_brain_facts (fatti strutturati, non vettoriali)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_brain_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  /** Chiave fatto: 'iva_regime', 'banche_principali', 'cciaa_codice', 'metodo_pagamento_default' */
  fact_key text NOT NULL,
  /** Valore strutturato. */
  fact_value jsonb NOT NULL,
  /** Sorgente: 'manual' (titolare ha inserito), 'auto' (estratto da dati), 'chat' (durante conversazione) */
  source text NOT NULL DEFAULT 'manual',
  /** User che ha inserito/aggiornato. */
  source_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  /** Confidenza 0..1. */
  confidence numeric(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_brain_facts_company ON public.ai_brain_facts(company_id, fact_key);

ALTER TABLE public.ai_brain_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brain_facts_read ON public.ai_brain_facts;
CREATE POLICY brain_facts_read ON public.ai_brain_facts FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS brain_facts_admin ON public.ai_brain_facts;
CREATE POLICY brain_facts_admin ON public.ai_brain_facts FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_brain_facts_updated_at ON public.ai_brain_facts;
CREATE TRIGGER trg_brain_facts_updated_at
  BEFORE UPDATE ON public.ai_brain_facts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: match_brain — ricerca semantica top-k via cosine similarity
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_brain(
  p_company_id uuid,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 6,
  p_min_similarity numeric DEFAULT 0.20,
  p_source_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_id uuid,
  content text,
  metadata jsonb,
  similarity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.source_type,
    d.source_id,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.ai_brain_documents d
  WHERE d.company_id = p_company_id
    AND d.embedding IS NOT NULL
    AND (p_source_types IS NULL OR d.source_type = ANY(p_source_types))
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT GREATEST(LEAST(p_match_count, 30), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.match_brain(uuid, vector, int, numeric, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_brain(uuid, vector, int, numeric, text[]) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: brain_upsert_document — insert idempotente + embedding update
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_upsert_document(
  p_company_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_content text,
  p_content_hash text,
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_visibility_roles text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ai_brain_documents
    (company_id, source_type, source_id, content, content_hash, embedding, metadata, visibility_roles)
  VALUES
    (p_company_id, p_source_type, p_source_id, p_content, p_content_hash,
     p_embedding, COALESCE(p_metadata, '{}'::jsonb), p_visibility_roles)
  ON CONFLICT (company_id, source_type, COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid), content_hash)
  DO UPDATE SET
    content = EXCLUDED.content,
    embedding = COALESCE(EXCLUDED.embedding, public.ai_brain_documents.embedding),
    metadata = EXCLUDED.metadata,
    visibility_roles = EXCLUDED.visibility_roles,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_upsert_document(uuid, text, uuid, text, text, vector, jsonb, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_upsert_document(uuid, text, uuid, text, text, vector, jsonb, text[]) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC: brain_stats — sintesi indicizzazione per company
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_stats(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_with_emb int;
  v_by_source jsonb;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE embedding IS NOT NULL)
  INTO v_total, v_with_emb
  FROM public.ai_brain_documents
  WHERE company_id = p_company_id;

  SELECT jsonb_object_agg(source_type, c) INTO v_by_source
  FROM (
    SELECT source_type, count(*) AS c
    FROM public.ai_brain_documents
    WHERE company_id = p_company_id
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'totale_documenti', v_total,
    'con_embedding', v_with_emb,
    'pending_embedding', v_total - v_with_emb,
    'breakdown_source', COALESCE(v_by_source, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.brain_stats(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.brain_stats(uuid) TO authenticated, service_role;
