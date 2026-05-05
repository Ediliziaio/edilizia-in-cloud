-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-11 — SPRINT 3: Knowledge Base universale + Memory (auto-facts)
-- ════════════════════════════════════════════════════════════════════════════
-- Architettura 2-tier:
--   1. SCOPE 'universal': documenti condivisi (normativa, business principles)
--      gestiti dal SuperAdmin, accessibili a TUTTE le aziende
--   2. SCOPE 'company': documenti privati per-azienda (commesse, clienti, ecc.)
--      isolati via RLS company_id
--
-- Memory:
--   • ai_brain_facts già esiste (creata in 20260504290000_ai_brain_rag.sql)
--   • Aggiungiamo trigger/cron per auto-promozione fatti dalle chat
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Aggiungi colonne scope + category a ai_brain_documents
-- ───────────────────────────────────────────────────────────────────────────

-- Permetti company_id NULL per scope='universal'
ALTER TABLE public.ai_brain_documents
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'company'
    CHECK (scope IN ('universal', 'company')),
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS title text;

-- Allenta vincolo company_id per scope universal
DO $$
BEGIN
  -- Drop existing FK to recreate as nullable-aware
  ALTER TABLE public.ai_brain_documents DROP CONSTRAINT IF EXISTS ai_brain_documents_company_id_fkey;
  ALTER TABLE public.ai_brain_documents
    ADD CONSTRAINT ai_brain_documents_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

  -- Allow NULL only when scope='universal'
  ALTER TABLE public.ai_brain_documents ALTER COLUMN company_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'company_id constraint already adjusted: %', SQLERRM;
END $$;

ALTER TABLE public.ai_brain_documents
  DROP CONSTRAINT IF EXISTS ai_brain_documents_scope_company_chk;
ALTER TABLE public.ai_brain_documents
  ADD CONSTRAINT ai_brain_documents_scope_company_chk
    CHECK (
      (scope = 'universal' AND company_id IS NULL) OR
      (scope = 'company' AND company_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_brain_docs_scope
  ON public.ai_brain_documents(scope, category) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brain_docs_universal
  ON public.ai_brain_documents(category, source_type)
  WHERE scope = 'universal';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RLS: chiunque autenticato può leggere documenti universal
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS brain_docs_universal_read ON public.ai_brain_documents;
CREATE POLICY brain_docs_universal_read ON public.ai_brain_documents FOR SELECT
  USING (scope = 'universal' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS brain_docs_universal_admin ON public.ai_brain_documents;
CREATE POLICY brain_docs_universal_admin ON public.ai_brain_documents FOR ALL
  USING (
    scope = 'universal' AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    scope = 'universal' AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Aggiorna match_brain per cercare anche in universal scope
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_brain(
  p_company_id uuid,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 6,
  p_min_similarity numeric DEFAULT 0.20,
  p_source_types text[] DEFAULT NULL,
  p_include_universal boolean DEFAULT true,
  p_universal_categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  scope text,
  source_type text,
  source_id uuid,
  title text,
  category text,
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
    d.scope,
    d.source_type,
    d.source_id,
    d.title,
    d.category,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.ai_brain_documents d
  WHERE d.embedding IS NOT NULL
    AND (
      -- Company-scoped per company_id specifico
      (d.scope = 'company' AND d.company_id = p_company_id)
      OR
      -- Universal accessibile a tutti se richiesto
      (p_include_universal = true AND d.scope = 'universal'
        AND (p_universal_categories IS NULL OR d.category = ANY(p_universal_categories)))
    )
    AND (p_source_types IS NULL OR d.source_type = ANY(p_source_types))
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT GREATEST(LEAST(p_match_count, 30), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.match_brain(uuid, vector, int, numeric, text[], boolean, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_brain(uuid, vector, int, numeric, text[], boolean, text[]) TO service_role;

-- Drop old signature
DROP FUNCTION IF EXISTS public.match_brain(uuid, vector(1536), int, numeric, text[]);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Aggiorna brain_upsert_document per supportare scope
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_upsert_document(
  p_company_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_content text,
  p_content_hash text,
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_visibility_roles text[] DEFAULT NULL,
  p_scope text DEFAULT 'company',
  p_category text DEFAULT NULL,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_scope = 'universal' THEN
    p_company_id := NULL;
  END IF;

  INSERT INTO public.ai_brain_documents
    (company_id, source_type, source_id, content, content_hash, embedding,
     metadata, visibility_roles, scope, category, title)
  VALUES
    (p_company_id, p_source_type, p_source_id, p_content, p_content_hash,
     p_embedding, COALESCE(p_metadata, '{}'::jsonb), p_visibility_roles,
     p_scope, p_category, p_title)
  ON CONFLICT (company_id, source_type, COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid), content_hash)
  DO UPDATE SET
    content = EXCLUDED.content,
    embedding = COALESCE(EXCLUDED.embedding, public.ai_brain_documents.embedding),
    metadata = EXCLUDED.metadata,
    visibility_roles = EXCLUDED.visibility_roles,
    scope = EXCLUDED.scope,
    category = EXCLUDED.category,
    title = EXCLUDED.title,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_upsert_document(uuid, text, uuid, text, text, vector, jsonb, text[], text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_upsert_document(uuid, text, uuid, text, text, vector, jsonb, text[], text, text, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Allenta unique constraint per supportare scope='universal' (company_id NULL)
-- ───────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS uq_brain_docs_dedup;
CREATE UNIQUE INDEX uq_brain_docs_dedup
  ON public.ai_brain_documents(
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_type,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    content_hash
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Stats con scope breakdown
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_stats(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_total int;
  v_company_with_emb int;
  v_universal_total int;
  v_universal_with_emb int;
  v_by_source jsonb;
  v_by_category jsonb;
BEGIN
  SELECT
    count(*) FILTER (WHERE scope = 'company' AND company_id = p_company_id),
    count(*) FILTER (WHERE scope = 'company' AND company_id = p_company_id AND embedding IS NOT NULL),
    count(*) FILTER (WHERE scope = 'universal'),
    count(*) FILTER (WHERE scope = 'universal' AND embedding IS NOT NULL)
  INTO v_company_total, v_company_with_emb, v_universal_total, v_universal_with_emb
  FROM public.ai_brain_documents;

  SELECT jsonb_object_agg(source_type, c) INTO v_by_source
  FROM (
    SELECT source_type, count(*) AS c FROM public.ai_brain_documents
    WHERE (scope = 'company' AND company_id = p_company_id) OR scope = 'universal'
    GROUP BY 1
  ) x;

  SELECT jsonb_object_agg(category, c) INTO v_by_category
  FROM (
    SELECT COALESCE(category, 'uncategorized') AS category, count(*) AS c
    FROM public.ai_brain_documents
    WHERE scope = 'universal'
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'company', jsonb_build_object(
      'totale', v_company_total,
      'con_embedding', v_company_with_emb
    ),
    'universal', jsonb_build_object(
      'totale', v_universal_total,
      'con_embedding', v_universal_with_emb,
      'breakdown_categoria', COALESCE(v_by_category, '{}'::jsonb)
    ),
    'breakdown_source', COALESCE(v_by_source, '{}'::jsonb)
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Memory: schema ai_brain_chat_summaries (storia chat sintetizzata)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_brain_chat_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  /** Sessione/canale di origine */
  session_id uuid,
  channel_id uuid,

  /** Period (es. "settimana del 2026-05-04") */
  period_start date NOT NULL,
  period_end date NOT NULL,

  /** Sintesi LLM-generata (max 500 char) */
  summary text NOT NULL,
  /** Topics estratti */
  topics text[],
  /** Decisioni prese / fatti chiave */
  key_facts jsonb DEFAULT '[]'::jsonb,
  /** Numero messaggi inclusi */
  messages_count int NOT NULL DEFAULT 0,

  /** Embedding per ricerca semantica */
  embedding vector(1536),

  /** Promosso a brain_documents? (auto se confidence > 0.7) */
  promoted boolean NOT NULL DEFAULT false,
  promoted_to uuid REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_summaries_user_period
  ON public.ai_brain_chat_summaries(user_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_chat_summaries_company
  ON public.ai_brain_chat_summaries(company_id, created_at DESC);

ALTER TABLE public.ai_brain_chat_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_summaries_self ON public.ai_brain_chat_summaries;
CREATE POLICY chat_summaries_self ON public.ai_brain_chat_summaries FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_summaries_admin ON public.ai_brain_chat_summaries;
CREATE POLICY chat_summaries_admin ON public.ai_brain_chat_summaries FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.ai_brain_chat_summaries IS
  'Sintesi periodiche chat utente con Silvio. Auto-promossi a brain se rilevanti.';

-- ───────────────────────────────────────────────────────────────────────────
-- 8) RPC: brain_record_fact — registra/aggiorna un fatto
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_record_fact(
  p_company_id uuid,
  p_fact_key text,
  p_fact_value jsonb,
  p_source text DEFAULT 'manual',
  p_source_user_id uuid DEFAULT NULL,
  p_confidence numeric DEFAULT 1.0,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ai_brain_facts
    (company_id, fact_key, fact_value, source, source_user_id, confidence, notes)
  VALUES
    (p_company_id, p_fact_key, p_fact_value, p_source, p_source_user_id, p_confidence, p_notes)
  ON CONFLICT (company_id, fact_key) DO UPDATE SET
    fact_value = EXCLUDED.fact_value,
    source = EXCLUDED.source,
    source_user_id = EXCLUDED.source_user_id,
    confidence = GREATEST(public.ai_brain_facts.confidence, EXCLUDED.confidence),
    notes = COALESCE(EXCLUDED.notes, public.ai_brain_facts.notes),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_record_fact(uuid, text, jsonb, text, uuid, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_record_fact(uuid, text, jsonb, text, uuid, numeric, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) RPC: brain_get_facts_for_user — fatti aziendali rilevanti
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brain_get_facts(
  p_company_id uuid,
  p_min_confidence numeric DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facts jsonb;
BEGIN
  SELECT jsonb_object_agg(fact_key, fact_value) INTO v_facts
  FROM public.ai_brain_facts
  WHERE company_id = p_company_id
    AND confidence >= p_min_confidence;

  RETURN COALESCE(v_facts, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.brain_get_facts(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.brain_get_facts(uuid, numeric) TO authenticated, service_role;
