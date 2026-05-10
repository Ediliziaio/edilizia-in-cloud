-- ════════════════════════════════════════════════════════════════════════════
-- GAP 8b — Apply entity_embeddings schema (paste-and-run)
-- Generato 2026-05-10T08:56:30Z — versione INLINED
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
--
-- DOPO l'apply:
--   1. Trigger backfill iniziale via curl (vedi sotto in fondo)
--   2. Trigger process per generare gli embeddings
--   3. Eventualmente schedula cron per re-sync periodico
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- GAP 8b — Semantic search cross-entità (clienti/cantieri/fatture)
-- ────────────────────────────────────────────────────────────────────────────
-- Tabella generica `entity_embeddings` per memorizzare embedding pgvector
-- di entità del business (profiles, orders, invoices, ecc.). Permette query
-- semantica unica cross-tipo come:
--   "cantieri con problemi DURC ultimi 6 mesi"
--   "fatture sopra 5000€ non pagate clienti milanesi"
--   "clienti che hanno chiesto preventivo ristrutturazione bagno"
--
-- Dimensione embedding: 1536 (text-embedding-3-small, allineato con
-- ai_brain_documents per riusabilità delle queries).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- pgvector già abilitato per ai_brain_documents
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1) Tabella entity_embeddings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entity_embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Entity identification
  entity_type   text NOT NULL CHECK (entity_type IN (
    'customer', 'order', 'invoice', 'opportunity', 'subcontractor', 'supplier'
  )),
  entity_id     uuid NOT NULL,
  -- Content per embedding (summary derivato dall'entità)
  content       text NOT NULL,
  -- Metadata utili per filtering post-search senza join (es. amount/status/created_at)
  metadata      jsonb DEFAULT '{}'::jsonb,
  -- Embedding pgvector
  embedding     vector(1536),
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  -- Lifecycle
  source_updated_at timestamptz,  -- quando l'entità sorgente è stata modificata l'ultima volta
  embedded_at   timestamptz,       -- quando è stato generato l'embedding
  is_dirty      boolean NOT NULL DEFAULT true,  -- true = da reembed (entità modificata)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 1 embedding per (company, entity_type, entity_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_embeddings_unique
  ON public.entity_embeddings (company_id, entity_type, entity_id);

-- pgvector index per query veloce (HNSW per recall alto)
CREATE INDEX IF NOT EXISTS idx_entity_embeddings_vector
  ON public.entity_embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_embeddings_dirty
  ON public.entity_embeddings (company_id, is_dirty, source_updated_at)
  WHERE is_dirty = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_entity_embeddings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_entity_embeddings_updated_at ON public.entity_embeddings;
CREATE TRIGGER trg_entity_embeddings_updated_at
  BEFORE UPDATE ON public.entity_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.tg_entity_embeddings_updated_at();

-- ─── 2) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.entity_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entity_embeddings_company_read ON public.entity_embeddings;
CREATE POLICY entity_embeddings_company_read ON public.entity_embeddings
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS entity_embeddings_service_all ON public.entity_embeddings;
CREATE POLICY entity_embeddings_service_all ON public.entity_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS entity_embeddings_super_admin ON public.entity_embeddings;
CREATE POLICY entity_embeddings_super_admin ON public.entity_embeddings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ─── 3) RPC search_entities_semantic ────────────────────────────────────────
-- Query pgvector cosine + filter per tipo entità + company.

CREATE OR REPLACE FUNCTION public.search_entities_semantic(
  p_company_id    uuid,
  p_query_embedding vector(1536),
  p_top_k         int DEFAULT 10,
  p_min_similarity numeric DEFAULT 0.20,
  p_entity_types  text[] DEFAULT NULL  -- NULL = tutti i tipi
)
RETURNS TABLE (
  id           uuid,
  entity_type  text,
  entity_id    uuid,
  content      text,
  metadata     jsonb,
  similarity   numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auth check: solo company member o super_admin
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.get_effective_company_id() = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.entity_type, e.entity_id, e.content, e.metadata,
    (1 - (e.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.entity_embeddings e
  WHERE e.company_id = p_company_id
    AND e.embedding IS NOT NULL
    AND (p_entity_types IS NULL OR e.entity_type = ANY(p_entity_types))
    AND (1 - (e.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_entities_semantic(uuid, vector, int, numeric, text[])
  TO authenticated, service_role;

-- ─── 4) RPC mark_entity_for_embed (chiamata da trigger DB) ─────────────────
-- Marca un entity_id come da reembed quando l'entità sorgente cambia.

CREATE OR REPLACE FUNCTION public.mark_entity_for_embed(
  p_company_id  uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_content     text,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.entity_embeddings (
    company_id, entity_type, entity_id, content, metadata,
    source_updated_at, is_dirty
  ) VALUES (
    p_company_id, p_entity_type, p_entity_id, p_content, COALESCE(p_metadata, '{}'::jsonb),
    now(), true
  )
  ON CONFLICT (company_id, entity_type, entity_id) DO UPDATE SET
    content = EXCLUDED.content,
    metadata = COALESCE(EXCLUDED.metadata, entity_embeddings.metadata),
    source_updated_at = now(),
    is_dirty = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_entity_for_embed(uuid, text, uuid, text, jsonb)
  TO authenticated, service_role;

-- ─── 5) RPC list_dirty_for_embed (chiamato da edge function) ───────────────
CREATE OR REPLACE FUNCTION public.list_dirty_entities_for_embed(p_limit int DEFAULT 50)
RETURNS TABLE (id uuid, company_id uuid, entity_type text, entity_id uuid, content text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, company_id, entity_type, entity_id, content
  FROM public.entity_embeddings
  WHERE is_dirty = true
  ORDER BY source_updated_at ASC NULLS FIRST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.list_dirty_entities_for_embed(int) TO service_role;

-- ─── 6) RPC mark_embedded (post-edge function update) ──────────────────────
CREATE OR REPLACE FUNCTION public.mark_entity_embedded(
  p_id uuid,
  p_embedding vector(1536)
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.entity_embeddings
  SET embedding = p_embedding,
      embedded_at = now(),
      is_dirty = false
  WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.mark_entity_embedded(uuid, vector) TO service_role;

COMMIT;

-- ─── Verifica ───────────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='entity_embeddings') AS table_ok,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') AS pgvector_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='search_entities_semantic') AS search_rpc_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='mark_entity_for_embed') AS mark_rpc_ok;

-- ─── Dopo l'apply, lancia backfill via curl (sostituisci secret) ────────
-- 1. INGEST: scansiona tabelle sorgente e marca dirty
-- curl -X POST https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/entity-embed-batch \
--   -H 'x-cron-secret: <PROACTIVE_CRON_SECRET>' \
--   -H 'Content-Type: application/json' \
--   -d '{"mode": "ingest", "entity_types": ["customer","order","invoice"], "limit": 200}'
--
-- 2. PROCESS: genera embedding per le entries marcate dirty (ripeti finché pending=0)
-- curl -X POST https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/entity-embed-batch \
--   -H 'x-cron-secret: <PROACTIVE_CRON_SECRET>' \
--   -H 'Content-Type: application/json' \
--   -d '{"mode": "process", "limit": 30}'
