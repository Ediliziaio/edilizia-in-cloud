-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 2 — KB Ingestion Pipeline Schema (additive, hybrid)
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge a ai_brain_documents le colonne mancanti per:
--   1. soft delete (deleted_at) → ingestion idempotente
--   2. analytics (hits_count, last_used_at) → tuning futuro
--   3. source_path text → per kb_universal con path file (esistente source_id e uuid)
--
-- NUOVE RPC dedicate kb_universal:
--   - brain_upsert_kb_chunk: insert/update by (source_type, source_path) match
--   - brain_soft_delete_kb_chunks: marca deleted_at chunks orfani
--   - match_brain estesa: filtra deleted_at IS NULL (no breaking)
--
-- VIEW v_brain_universal_kb_stats per monitoring.
--
-- Strategia hybrid: NON tocco brain_upsert_document esistente (usato altrove)
-- per non rompere usi correnti.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Schema additive su ai_brain_documents
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_brain_documents
  ADD COLUMN IF NOT EXISTS source_path text,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS hits_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

COMMENT ON COLUMN public.ai_brain_documents.source_path IS
  'Path file relativo per kb_universal (es. 01-normativa-edilizia/dlgs-81-08.md#sezione#1). NULL per source_id uuid (usi non-kb).';
COMMENT ON COLUMN public.ai_brain_documents.source_hash IS
  'Hash SHA-256 del contenuto chunk per detect modifiche (idempotenza ingestion).';
COMMENT ON COLUMN public.ai_brain_documents.deleted_at IS
  'Soft delete timestamp. NULL = chunk attivo. Set quando ingestion rileva chunk orfano.';

-- Indici performance
CREATE INDEX IF NOT EXISTS idx_brain_docs_source_path
  ON public.ai_brain_documents (source_type, source_path)
  WHERE source_path IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_brain_docs_active
  ON public.ai_brain_documents (scope, category)
  WHERE deleted_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC: brain_upsert_kb_chunk — upsert kb_universal chunk
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_upsert_kb_chunk(
  p_source_path text,
  p_title text,
  p_content text,
  p_embedding vector(1536),
  p_category text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_existing_hash text;
  v_action text := 'insert';
BEGIN
  IF p_source_path IS NULL OR length(p_source_path) = 0 THEN
    RAISE EXCEPTION 'source_path obbligatorio per kb_universal chunk';
  END IF;

  -- Match esistente per (source_type='kb_universal', source_path)
  SELECT id, source_hash INTO v_id, v_existing_hash
  FROM public.ai_brain_documents
  WHERE source_type = 'kb_universal'
    AND source_path = p_source_path
    AND scope = 'universal'
    AND deleted_at IS NULL
  LIMIT 1;

  -- Se hash invariato → skip (idempotenza)
  IF v_id IS NOT NULL AND v_existing_hash IS NOT DISTINCT FROM p_source_hash THEN
    RETURN jsonb_build_object('id', v_id, 'action', 'skip', 'reason', 'hash_unchanged');
  END IF;

  -- Update esistente
  IF v_id IS NOT NULL THEN
    UPDATE public.ai_brain_documents SET
      title = p_title,
      content = p_content,
      embedding = p_embedding,
      category = p_category,
      metadata = COALESCE(p_metadata, '{}'::jsonb),
      source_hash = p_source_hash,
      content_hash = p_source_hash,  -- compat con campo legacy
      updated_at = now()
    WHERE id = v_id;
    v_action := 'update';
  ELSE
    -- Insert nuovo: genera UUID per source_id (text→uuid bridge)
    INSERT INTO public.ai_brain_documents (
      company_id, scope, source_type, source_id, source_path,
      category, title, content, embedding, metadata,
      content_hash, source_hash
    ) VALUES (
      NULL, 'universal', 'kb_universal', gen_random_uuid(), p_source_path,
      p_category, p_title, p_content, p_embedding,
      COALESCE(p_metadata, '{}'::jsonb),
      p_source_hash, p_source_hash
    ) RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'action', v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.brain_upsert_kb_chunk(text, text, text, vector, text, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.brain_upsert_kb_chunk(text, text, text, vector, text, jsonb, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: brain_soft_delete_kb_chunks — orphan cleanup
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_soft_delete_kb_chunks(
  p_active_source_paths text[]
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH soft_deleted AS (
    UPDATE public.ai_brain_documents
    SET deleted_at = now()
    WHERE source_type = 'kb_universal'
      AND scope = 'universal'
      AND deleted_at IS NULL
      AND (source_path IS NULL OR source_path <> ALL(p_active_source_paths))
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM soft_deleted;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_soft_delete_kb_chunks(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.brain_soft_delete_kb_chunks(text[]) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) match_brain: aggiorna per filtrare deleted_at (no-op se gia filtra)
-- ───────────────────────────────────────────────────────────────────────────
-- La RPC esistente match_brain accetta gia p_universal_categories.
-- Aggiungo filter deleted_at IS NULL per non ritornare chunk soft-deleted.

CREATE OR REPLACE FUNCTION public.match_brain(
  p_company_id uuid,
  p_query_embedding vector,
  p_match_count int DEFAULT 6,
  p_min_similarity numeric DEFAULT 0.20,
  p_source_types text[] DEFAULT NULL,
  p_include_universal boolean DEFAULT true,
  p_universal_categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid, scope text, source_type text, source_id uuid,
  title text, category text, content text, metadata jsonb,
  similarity numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id, d.scope, d.source_type, d.source_id,
    d.title, d.category, d.content, d.metadata,
    (1 - (d.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.ai_brain_documents d
  WHERE d.deleted_at IS NULL
    AND (
      (p_include_universal AND d.scope = 'universal')
      OR (d.scope = 'company' AND d.company_id = p_company_id)
    )
    AND (p_source_types IS NULL OR d.source_type = ANY(p_source_types))
    AND (p_universal_categories IS NULL OR d.scope = 'company' OR d.category = ANY(p_universal_categories))
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_brain(uuid, vector, int, numeric, text[], boolean, text[]) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC: bump hits_count + last_used_at quando un chunk viene servito
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_record_hits(p_chunk_ids uuid[])
RETURNS int
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  WITH bumped AS (
    UPDATE public.ai_brain_documents
    SET hits_count = COALESCE(hits_count, 0) + 1,
        last_used_at = now()
    WHERE id = ANY(p_chunk_ids)
    RETURNING id
  )
  SELECT count(*)::int FROM bumped;
$$;

GRANT EXECUTE ON FUNCTION public.brain_record_hits(uuid[]) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) View per monitoring
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_brain_universal_kb_stats AS
SELECT
  category,
  count(*) FILTER (WHERE deleted_at IS NULL) AS active_chunks,
  count(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted_chunks,
  COALESCE(sum(hits_count) FILTER (WHERE deleted_at IS NULL), 0) AS total_hits,
  max(updated_at) FILTER (WHERE deleted_at IS NULL) AS last_update,
  (avg(length(content)) FILTER (WHERE deleted_at IS NULL))::int AS avg_chunk_size_chars,
  count(DISTINCT source_path) FILTER (WHERE deleted_at IS NULL) AS unique_docs
FROM public.ai_brain_documents
WHERE scope = 'universal' AND source_type = 'kb_universal'
GROUP BY category
ORDER BY category;

COMMENT ON VIEW public.v_brain_universal_kb_stats IS
  'Statistiche KB universale per area (active/deleted chunks, hits, last update). Per monitoring Track 2 ingestion.';

GRANT SELECT ON public.v_brain_universal_kb_stats TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Verifica post-migration
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_name='ai_brain_documents'
     AND column_name IN ('source_path','source_hash','deleted_at','hits_count','last_used_at');
  IF v_cnt <> 5 THEN
    RAISE EXCEPTION 'Atteso 5 nuove cols su ai_brain_documents, trovate %', v_cnt;
  END IF;
  RAISE NOTICE 'OK: 5/5 colonne aggiunte';

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='brain_upsert_kb_chunk') THEN
    RAISE EXCEPTION 'RPC brain_upsert_kb_chunk non creata';
  END IF;
  RAISE NOTICE 'OK: RPC brain_upsert_kb_chunk creata';

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='brain_soft_delete_kb_chunks') THEN
    RAISE EXCEPTION 'RPC brain_soft_delete_kb_chunks non creata';
  END IF;
  RAISE NOTICE 'OK: RPC brain_soft_delete_kb_chunks creata';

  IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='v_brain_universal_kb_stats') THEN
    RAISE EXCEPTION 'View v_brain_universal_kb_stats non creata';
  END IF;
  RAISE NOTICE 'OK: view v_brain_universal_kb_stats creata';
END $$;

COMMIT;
