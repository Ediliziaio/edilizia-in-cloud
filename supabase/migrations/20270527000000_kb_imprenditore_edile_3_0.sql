-- ═══════════════════════════════════════════════════════════════════════════
-- KB IMPRENDITORE EDILE 3.0 — Metodo + Coach Voice + Per-Company Overrides
-- -----------------------------------------------------------------------
-- Estende l'infrastruttura RAG esistente (`ai_brain_documents` +
-- `search_silvio_knowledge`) con:
--
--   1. Convenzione kb_section per i 22 manuali del metodo "Imprenditore
--      Edile 3.0" (3 volumi + 16 manuali tematici + 3 fogli di verifica).
--   2. Cardinal principles → caricati SEMPRE nel system prompt (ibrido).
--   3. `company_kb_overrides` → quando un'azienda dice "per noi questa
--      regola cambia", l'override vale SOLO per quell'azienda.
--   4. RPC `search_silvio_knowledge_v2` con merge override per azienda.
--   5. Audit log citazioni: `silvio_kb_citation_log`.
--
-- IP boundary (Decisione 1 — "Opzione A"):
--   - KB accessibile SOLO da agenti super_admin (Silvio central brain).
--   - Agenti azienda (lato Florin cliente) NON leggono direttamente il KB.
--   - L'unico ponte è il `company_kb_overrides`: l'azienda può
--     "personalizzare" una regola per sé — quella override è leggibile
--     dal solo contesto azienda + super_admin.
--
-- Voce (Decisione 8): autorevole da coach (vedi kb/imprenditore-edile-3-0/coach-voice.md).
-- Citazioni (Decisione 2): mai citare la fonte — tono nativo Silvio.
--   Per audit interno tracciamo cmq quali chunk hanno ispirato la risposta.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tag il chunk type per distinguere "cardinal" da "detail"
--    Cardinal = top 20 principi sempre caricati (~800 token).
--    Detail   = chunk RAG normale (caricato solo se semantic search lo trova).
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_brain_documents
  ADD COLUMN IF NOT EXISTS kb_priority TEXT
    CHECK (kb_priority IN ('cardinal', 'detail', 'verifica', 'esercizio'))
    DEFAULT 'detail';

ALTER TABLE public.ai_brain_documents
  ADD COLUMN IF NOT EXISTS kb_source_book TEXT;  -- es. 'volume-1', 'gestione-finanziaria'

CREATE INDEX IF NOT EXISTS idx_brain_kb_priority
  ON public.ai_brain_documents(kb_priority)
  WHERE deleted_at IS NULL AND scope = 'silvio_admin';

COMMENT ON COLUMN public.ai_brain_documents.kb_priority IS
  'cardinal=sempre in system prompt | detail=via RAG | verifica=foglio di verifica | esercizio=quaderno esercizi';

COMMENT ON COLUMN public.ai_brain_documents.kb_source_book IS
  'Slug del manuale di origine (per filtri e debugging).';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) `company_kb_overrides` — per-company rule overrides
--    Quando un'azienda dice "per noi cambia questa regola" → override
--    pesa più del chunk originale SOLO nel contesto di quella azienda.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_kb_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_doc_id   UUID REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,
  kb_section      TEXT,
  kb_subsection   TEXT,

  -- Override content
  original_excerpt TEXT,        -- estratto del principio originale (per contesto)
  override_text    TEXT NOT NULL,   -- la nuova regola valida solo per questa azienda
  rationale        TEXT,        -- perché l'azienda l'ha chiesto

  -- Embedding del testo override per semantic match
  embedding       vector(1536),

  -- Lifecycle
  is_active       BOOLEAN DEFAULT TRUE,
  effective_from  TIMESTAMPTZ DEFAULT now(),
  effective_to    TIMESTAMPTZ,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_kb_overrides_company
  ON public.company_kb_overrides(company_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_company_kb_overrides_source
  ON public.company_kb_overrides(source_doc_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_company_kb_overrides_embedding
  ON public.company_kb_overrides
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE is_active = TRUE AND embedding IS NOT NULL;

ALTER TABLE public.company_kb_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_kb_overrides_read ON public.company_kb_overrides;
CREATE POLICY company_kb_overrides_read ON public.company_kb_overrides
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS company_kb_overrides_write ON public.company_kb_overrides;
CREATE POLICY company_kb_overrides_write ON public.company_kb_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.company_kb_overrides IS
  'Per-company override del metodo Imprenditore Edile 3.0. L''azienda può chiedere "per noi cambia questa regola" — vale SOLO per quell''azienda.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) `silvio_kb_citation_log` — audit trail interno
--    Decisione 2: non citiamo la fonte all'utente, MA tracciamo internamente
--    quali chunk hanno alimentato ogni risposta (per quality + drift detection).
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_kb_citation_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID,
  persona_key   TEXT,
  company_id    UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_query    TEXT,
  doc_ids       UUID[] NOT NULL DEFAULT '{}',
  override_ids  UUID[] NOT NULL DEFAULT '{}',
  similarity_scores NUMERIC[] DEFAULT '{}',
  used_in_response BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_citation_persona_time
  ON public.silvio_kb_citation_log(persona_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kb_citation_company
  ON public.silvio_kb_citation_log(company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

ALTER TABLE public.silvio_kb_citation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS silvio_kb_citation_log_read ON public.silvio_kb_citation_log;
CREATE POLICY silvio_kb_citation_log_read ON public.silvio_kb_citation_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.silvio_kb_citation_log IS
  'Audit interno chunk citati. Non visibile all''utente — solo per quality monitoring lato founder.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC `search_silvio_knowledge_v2` — semantic search con override azienda
-- ───────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.search_silvio_knowledge_v2(vector, INT, NUMERIC, TEXT, TEXT[], UUID);

CREATE OR REPLACE FUNCTION public.search_silvio_knowledge_v2(
  p_query_embedding vector(1536),
  p_top_k           INT     DEFAULT 8,
  p_min_similarity  NUMERIC DEFAULT 0.30,
  p_persona_key     TEXT    DEFAULT NULL,
  p_kb_sections     TEXT[]  DEFAULT NULL,
  p_company_id      UUID    DEFAULT NULL
)
RETURNS TABLE (
  result_type      TEXT,           -- 'kb_chunk' | 'company_override'
  doc_id           UUID,
  chunk_id         TEXT,
  title            TEXT,
  content          TEXT,
  kb_section       TEXT,
  kb_subsection    TEXT,
  kb_priority      TEXT,
  kb_source_book   TEXT,
  persona_keys     TEXT[],
  source_path      TEXT,
  similarity       NUMERIC,
  override_id      UUID,
  override_rationale TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role TEXT;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base_chunks AS (
    SELECT
      'kb_chunk'::TEXT AS result_type,
      d.id AS doc_id,
      d.chunk_id,
      d.title,
      d.content,
      d.kb_section,
      d.kb_subsection,
      d.kb_priority,
      d.kb_source_book,
      d.persona_keys,
      d.source_path,
      (1 - (d.embedding <=> p_query_embedding))::NUMERIC AS similarity,
      NULL::UUID AS override_id,
      NULL::TEXT AS override_rationale
    FROM public.ai_brain_documents d
    WHERE d.deleted_at IS NULL
      AND d.embedding IS NOT NULL
      AND d.scope = 'silvio_admin'
      AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
      AND (
        p_persona_key IS NULL
        OR d.persona_keys = '{}'
        OR p_persona_key = ANY(d.persona_keys)
      )
      AND (p_kb_sections IS NULL OR d.kb_section = ANY(p_kb_sections))
      -- Esclude i cardinal: già caricati nel system prompt, no spreco budget
      AND COALESCE(d.kb_priority, 'detail') <> 'cardinal'
    ORDER BY d.embedding <=> p_query_embedding
    LIMIT p_top_k * 2  -- prendiamo extra per dare spazio agli override
  ),
  overrides AS (
    SELECT
      'company_override'::TEXT AS result_type,
      o.source_doc_id AS doc_id,
      NULL::TEXT AS chunk_id,
      'Override aziendale'::TEXT AS title,
      o.override_text AS content,
      o.kb_section,
      o.kb_subsection,
      'detail'::TEXT AS kb_priority,
      NULL::TEXT AS kb_source_book,
      '{}'::TEXT[] AS persona_keys,
      NULL::TEXT AS source_path,
      -- Boost override: +0.1 di similarity per pesare di più
      LEAST(1.0, (1 - (o.embedding <=> p_query_embedding))::NUMERIC + 0.10) AS similarity,
      o.id AS override_id,
      o.rationale AS override_rationale
    FROM public.company_kb_overrides o
    WHERE p_company_id IS NOT NULL
      AND o.company_id = p_company_id
      AND o.is_active = TRUE
      AND (o.effective_to IS NULL OR o.effective_to > now())
      AND o.embedding IS NOT NULL
      AND (1 - (o.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY o.embedding <=> p_query_embedding
    LIMIT p_top_k
  ),
  merged AS (
    SELECT * FROM base_chunks
    UNION ALL
    SELECT * FROM overrides
  )
  -- Se esiste un override per il source_doc_id, "sostituisce" il chunk originale
  SELECT m.*
  FROM merged m
  WHERE NOT EXISTS (
    SELECT 1 FROM overrides ov
    WHERE ov.doc_id = m.doc_id
      AND m.result_type = 'kb_chunk'
  )
  ORDER BY m.similarity DESC
  LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_silvio_knowledge_v2(vector, INT, NUMERIC, TEXT, TEXT[], UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.search_silvio_knowledge_v2 IS
  'V2: semantic search con company override merge. Se l''azienda ha override per un principio, lo sostituisce nel risultato.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC `get_cardinal_principles` — recupera i top 20 principi
--    Chiamata 1x per sessione, iniettati nel system prompt (modalità ibrida).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cardinal_principles(
  p_persona_key TEXT DEFAULT NULL,
  p_company_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  doc_id        UUID,
  title         TEXT,
  content       TEXT,
  kb_section    TEXT,
  override_text TEXT,
  override_id   UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role TEXT;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.content,
    d.kb_section,
    o.override_text,
    o.id AS override_id
  FROM public.ai_brain_documents d
  LEFT JOIN public.company_kb_overrides o
    ON o.source_doc_id = d.id
   AND o.is_active = TRUE
   AND (o.effective_to IS NULL OR o.effective_to > now())
   AND o.company_id = p_company_id
  WHERE d.scope = 'silvio_admin'
    AND d.deleted_at IS NULL
    AND d.kb_priority = 'cardinal'
    AND (
      p_persona_key IS NULL
      OR d.persona_keys = '{}'
      OR p_persona_key = ANY(d.persona_keys)
    )
  ORDER BY d.kb_section, d.kb_subsection
  LIMIT 25;  -- safety cap: ~1000 token max
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cardinal_principles(TEXT, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_cardinal_principles IS
  'Recupera i principi cardinali (sempre caricati nel system prompt). Se p_company_id passato, applica override aziendali.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RPC `log_kb_citation` — registra l'uso dei chunk in una risposta
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_kb_citation(
  p_session_id        UUID,
  p_persona_key       TEXT,
  p_company_id        UUID,
  p_user_query        TEXT,
  p_doc_ids           UUID[],
  p_override_ids      UUID[],
  p_similarity_scores NUMERIC[],
  p_used_in_response  BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.silvio_kb_citation_log (
    session_id, persona_key, company_id, user_query,
    doc_ids, override_ids, similarity_scores, used_in_response
  ) VALUES (
    p_session_id, p_persona_key, p_company_id, p_user_query,
    COALESCE(p_doc_ids, '{}'),
    COALESCE(p_override_ids, '{}'),
    COALESCE(p_similarity_scores, '{}'),
    p_used_in_response
  )
  RETURNING id INTO v_id;

  -- Trigger anche update hits_count sui chunk
  IF p_doc_ids IS NOT NULL AND array_length(p_doc_ids, 1) > 0 AND p_used_in_response THEN
    UPDATE public.ai_brain_documents
       SET hits_count = COALESCE(hits_count, 0) + 1,
           last_used_at = now()
     WHERE id = ANY(p_doc_ids);
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_kb_citation(UUID, TEXT, UUID, TEXT, UUID[], UUID[], NUMERIC[], BOOLEAN)
  TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) View `v_kb_imprenditore_edile_stats` — quanti chunk per libro/persona
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_kb_imprenditore_edile_stats AS
SELECT
  d.kb_source_book,
  d.kb_section,
  d.kb_priority,
  COUNT(*) AS n_chunks,
  SUM(LENGTH(d.content)) AS total_chars,
  (
    SELECT COUNT(DISTINCT pk)
    FROM public.ai_brain_documents d2,
         LATERAL unnest(d2.persona_keys) AS pk
    WHERE d2.scope = 'silvio_admin'
      AND d2.deleted_at IS NULL
      AND d2.kb_source_book = d.kb_source_book
      AND d2.kb_section = d.kb_section
      AND d2.kb_priority = d.kb_priority
      AND d2.persona_keys <> '{}'
  ) AS n_personas_assigned,
  SUM(d.hits_count) FILTER (WHERE d.hits_count > 0) AS total_hits,
  MAX(d.updated_at) AS last_updated
FROM public.ai_brain_documents d
WHERE d.scope = 'silvio_admin'
  AND d.deleted_at IS NULL
  AND d.kb_source_book IS NOT NULL
GROUP BY d.kb_source_book, d.kb_section, d.kb_priority
ORDER BY d.kb_source_book, d.kb_section;

GRANT SELECT ON public.v_kb_imprenditore_edile_stats TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) Updated_at trigger per company_kb_overrides
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.company_kb_overrides_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_kb_overrides_touch ON public.company_kb_overrides;
CREATE TRIGGER trg_company_kb_overrides_touch
  BEFORE UPDATE ON public.company_kb_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.company_kb_overrides_touch();

COMMIT;
