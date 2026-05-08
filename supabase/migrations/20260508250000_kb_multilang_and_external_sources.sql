-- ═══════════════════════════════════════════════════════════════════════════
-- KB IMPROVEMENTS — Multi-lingua + Auto-sync External Sources
-- -----------------------------------------------------------------------
-- 1. Multi-lingua: indici/filtri per language; RPC kb_test_query_multilang
--    che filtra per language match e supporta cross-lingua opzionale.
-- 2. External sources: tabella ai_kb_external_sources, RPC helper, cron.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Index su language per filtering veloce
-- ───────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_kb_language
  ON public.ai_brain_documents (language)
  WHERE deleted_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RPC kb_test_query_multilang — vector search filtrato per language
-- ───────────────────────────────────────────────────────────────────────────
-- Differenze rispetto a kb_test_query:
--   - p_language: 'it'|'en'|'es'|... — match esatto (NULL = no filter)
--   - p_cross_lang_fallback: se true e nessun risultato in p_language,
--       prova senza il filtro (utile per query rare in lingue minori)
--   - Ritorna anche language e embedding_model nel result set

CREATE OR REPLACE FUNCTION public.kb_test_query_multilang(
  p_query                TEXT,
  p_query_embedding      vector(1536) DEFAULT NULL,
  p_top_k                INT DEFAULT 5,
  p_min_similarity       NUMERIC DEFAULT 0.20,
  p_language             TEXT DEFAULT NULL,
  p_cross_lang_fallback  BOOLEAN DEFAULT false,
  p_category_path        TEXT DEFAULT NULL,
  p_company_id           UUID DEFAULT NULL,
  p_include_expired      BOOLEAN DEFAULT false
)
RETURNS TABLE (
  chunk_id              TEXT,
  doc_id                UUID,
  title                 TEXT,
  category              TEXT,
  category_path         TEXT,
  language              TEXT,
  content_preview       TEXT,
  similarity            NUMERIC,
  hits_count            INT,
  last_used_at          TIMESTAMPTZ,
  last_verified_at      TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,
  is_expired            BOOLEAN,
  replaces_doc_id       UUID,
  embedding_model       TEXT,
  matched_via_fallback  BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super BOOLEAN;
  v_count    INT;
BEGIN
  v_is_super := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Permesso negato: solo super_admin' USING ERRCODE = '42501';
  END IF;

  IF p_query_embedding IS NULL THEN
    RAISE EXCEPTION 'p_query_embedding è obbligatorio per multilang query' USING ERRCODE = '22023';
  END IF;

  -- Tentativo principale: language match esatto (se richiesto)
  RETURN QUERY
  SELECT
    d.chunk_id,
    d.id AS doc_id,
    d.title,
    d.category,
    d.category_path,
    d.language,
    LEFT(d.content, 300) AS content_preview,
    (1 - (d.embedding <=> p_query_embedding))::NUMERIC AS similarity,
    d.hits_count,
    d.last_used_at,
    d.last_verified_at,
    d.valid_until,
    (d.valid_until IS NOT NULL AND d.valid_until < now()) AS is_expired,
    d.replaces_doc_id,
    d.embedding_model,
    false AS matched_via_fallback
  FROM public.ai_brain_documents d
  WHERE d.deleted_at IS NULL
    AND d.embedding IS NOT NULL
    AND (p_language IS NULL OR d.language = p_language)
    AND (p_company_id IS NULL OR d.company_id = p_company_id OR d.scope = 'universal')
    AND (p_category_path IS NULL OR d.category_path LIKE p_category_path || '%')
    AND (p_include_expired OR d.valid_until IS NULL OR d.valid_until > now())
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT p_top_k;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Fallback cross-lingua se richiesto e zero risultati
  IF v_count = 0 AND p_cross_lang_fallback AND p_language IS NOT NULL THEN
    RETURN QUERY
    SELECT
      d.chunk_id,
      d.id AS doc_id,
      d.title,
      d.category,
      d.category_path,
      d.language,
      LEFT(d.content, 300) AS content_preview,
      (1 - (d.embedding <=> p_query_embedding))::NUMERIC AS similarity,
      d.hits_count,
      d.last_used_at,
      d.last_verified_at,
      d.valid_until,
      (d.valid_until IS NOT NULL AND d.valid_until < now()) AS is_expired,
      d.replaces_doc_id,
      d.embedding_model,
      true AS matched_via_fallback
    FROM public.ai_brain_documents d
    WHERE d.deleted_at IS NULL
      AND d.embedding IS NOT NULL
      AND (p_company_id IS NULL OR d.company_id = p_company_id OR d.scope = 'universal')
      AND (p_category_path IS NULL OR d.category_path LIKE p_category_path || '%')
      AND (p_include_expired OR d.valid_until IS NULL OR d.valid_until > now())
      AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY d.embedding <=> p_query_embedding
    LIMIT p_top_k;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kb_test_query_multilang(TEXT, vector, INT, NUMERIC, TEXT, BOOLEAN, TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kb_test_query_multilang(TEXT, vector, INT, NUMERIC, TEXT, BOOLEAN, TEXT, UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.kb_test_query_multilang IS
  'Vector search KB con filtro per language esplicito + fallback cross-lingua opzionale.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. TABELLA ai_kb_external_sources — fonti esterne per auto-sync
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_kb_external_sources (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificazione
  name                     TEXT NOT NULL,
  description              TEXT,
  url                      TEXT NOT NULL,
  -- Strategia di scraping
  -- 'http_regex'   → fetch HTML, applica regex su body, prendi gruppo
  -- 'http_selector'→ fetch HTML, applica CSS-like selector via simple parser
  -- 'http_json'    → fetch JSON, JSONPath
  -- 'rss'          → parse RSS feed, prendi N entry più recenti
  scrape_strategy          TEXT NOT NULL CHECK (scrape_strategy IN ('http_regex','http_selector','http_json','rss','full_text')),
  -- Config strategy-specific (regex pattern, selector, jsonpath, rss item count)
  scrape_config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Frequenza in ore
  frequency_hours          INT NOT NULL DEFAULT 168 CHECK (frequency_hours BETWEEN 1 AND 8760),
  -- Stato sync
  enabled                  BOOLEAN NOT NULL DEFAULT true,
  last_synced_at           TIMESTAMPTZ,
  last_change_detected_at  TIMESTAMPTZ,
  last_content_hash        TEXT,
  last_status              TEXT DEFAULT 'never_run' CHECK (last_status IN ('never_run','ok','no_change','changed','error','skipped')),
  last_error               TEXT,
  consecutive_errors       INT NOT NULL DEFAULT 0,
  -- Target document: ogni source aggiorna 1 doc canonico (versionato)
  target_doc_id            UUID REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,
  target_category_path     TEXT,
  target_language          TEXT NOT NULL DEFAULT 'it',
  target_scope             TEXT NOT NULL DEFAULT 'universal' CHECK (target_scope IN ('universal','company')),
  target_company_id        UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Audit
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_company_scope CHECK (
    (target_scope = 'universal' AND target_company_id IS NULL) OR
    (target_scope = 'company'   AND target_company_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_kb_ext_sources_due
  ON public.ai_kb_external_sources (enabled, last_synced_at)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_kb_ext_sources_status
  ON public.ai_kb_external_sources (last_status);

ALTER TABLE public.ai_kb_external_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ext_sources_super_admin_all" ON public.ai_kb_external_sources;
CREATE POLICY "ext_sources_super_admin_all" ON public.ai_kb_external_sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "ext_sources_service_all" ON public.ai_kb_external_sources;
CREATE POLICY "ext_sources_service_all" ON public.ai_kb_external_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fn_kb_ext_sources_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_kb_ext_sources_updated_at ON public.ai_kb_external_sources;
CREATE TRIGGER trg_kb_ext_sources_updated_at
  BEFORE UPDATE ON public.ai_kb_external_sources
  FOR EACH ROW EXECUTE FUNCTION public.fn_kb_ext_sources_updated_at();

COMMENT ON TABLE public.ai_kb_external_sources IS
  'Fonti esterne (Agenzia Entrate, Inps, Inail, Gazzetta Ufficiale, ...) da scrapare periodicamente per mantenere fresca la KB.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. VIEW v_kb_external_sources_status — overview con drift alerts
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_kb_external_sources_status AS
SELECT
  s.id,
  s.name,
  s.url,
  s.scrape_strategy,
  s.frequency_hours,
  s.enabled,
  s.last_synced_at,
  s.last_change_detected_at,
  s.last_status,
  s.consecutive_errors,
  s.target_doc_id,
  s.target_language,
  s.target_category_path,
  d.title AS target_doc_title,
  d.last_verified_at AS target_last_verified_at,
  d.valid_until AS target_valid_until,
  -- Quanto è "in ritardo" rispetto alla frequency
  CASE
    WHEN s.last_synced_at IS NULL THEN 'never_synced'
    WHEN s.last_synced_at + (s.frequency_hours || ' hours')::interval < now()
      THEN 'overdue'
    ELSE 'on_schedule'
  END AS schedule_status,
  -- Drift alert: doc esiste ma non viene mai aggiornato dalla source
  CASE
    WHEN s.consecutive_errors >= 3 THEN 'critical'
    WHEN s.last_synced_at IS NULL THEN 'info'
    WHEN s.last_synced_at + (s.frequency_hours * 2 || ' hours')::interval < now() THEN 'warning'
    WHEN s.last_change_detected_at IS NOT NULL
         AND s.last_change_detected_at < now() - interval '365 days' THEN 'stale'
    ELSE 'ok'
  END AS drift_severity
FROM public.ai_kb_external_sources s
LEFT JOIN public.ai_brain_documents d ON d.id = s.target_doc_id;

GRANT SELECT ON public.v_kb_external_sources_status TO authenticated;
GRANT SELECT ON public.v_kb_external_sources_status TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RPC kb_external_sources_due — lista source pronte per sync
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kb_external_sources_due(
  p_limit INT DEFAULT 50
)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.ai_kb_external_sources s
  WHERE s.enabled = true
    AND (
      s.last_synced_at IS NULL
      OR s.last_synced_at + (s.frequency_hours || ' hours')::interval < now()
    )
    AND s.consecutive_errors < 5
  ORDER BY COALESCE(s.last_synced_at, '1970-01-01'::timestamptz) ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.kb_external_sources_due(INT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. RPC kb_external_source_apply_change — chiamata dalla edge function
--    quando rileva un cambio: versiona il vecchio doc e crea uno nuovo.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kb_external_source_apply_change(
  p_source_id    UUID,
  p_new_content  TEXT,
  p_new_hash     TEXT,
  p_new_title    TEXT,
  p_new_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (new_doc_id UUID, replaced_doc_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source        RECORD;
  v_old_doc_id    UUID;
  v_new_doc_id    UUID;
  v_company_id    UUID;
BEGIN
  SELECT * INTO v_source
  FROM public.ai_kb_external_sources
  WHERE id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source % non trovata', p_source_id;
  END IF;

  v_old_doc_id := v_source.target_doc_id;

  -- Schema: scope='universal' richiede company_id IS NULL,
  --         scope='company'   richiede company_id NOT NULL.
  IF v_source.target_scope = 'company' THEN
    v_company_id := v_source.target_company_id;
  ELSE
    v_company_id := NULL;
  END IF;

  -- 1. Marca il vecchio come scaduto (valid_until = now)
  IF v_old_doc_id IS NOT NULL THEN
    UPDATE public.ai_brain_documents
    SET valid_until = now()
    WHERE id = v_old_doc_id
      AND (valid_until IS NULL OR valid_until > now());
  END IF;

  -- 2. Crea il nuovo doc (embedding NULL → verrà popolato da ai-brain-ingest)
  INSERT INTO public.ai_brain_documents (
    company_id, source_type, source_id, content, content_hash,
    metadata, language, scope, category, category_path,
    title, replaces_doc_id, last_verified_at, embedding_model, embedding_dim
  ) VALUES (
    v_company_id,
    'external_source',
    p_source_id,
    p_new_content,
    p_new_hash,
    COALESCE(p_new_metadata, '{}'::jsonb) || jsonb_build_object('source_url', v_source.url, 'source_name', v_source.name),
    v_source.target_language,
    v_source.target_scope,
    split_part(COALESCE(v_source.target_category_path, 'external'), '/', 1),
    v_source.target_category_path,
    p_new_title,
    v_old_doc_id,
    now(),
    'text-embedding-3-small',
    1536
  )
  RETURNING id INTO v_new_doc_id;

  -- 3. Aggiorna source: punta al nuovo doc
  UPDATE public.ai_kb_external_sources
  SET target_doc_id           = v_new_doc_id,
      last_change_detected_at = now(),
      last_content_hash       = p_new_hash,
      last_status             = 'changed',
      last_error              = NULL,
      consecutive_errors      = 0,
      last_synced_at          = now()
  WHERE id = p_source_id;

  new_doc_id      := v_new_doc_id;
  replaced_doc_id := v_old_doc_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kb_external_source_apply_change(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. RPC kb_external_source_mark_unchanged / mark_error
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kb_external_source_mark_unchanged(p_source_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ai_kb_external_sources
  SET last_synced_at     = now(),
      last_status        = 'no_change',
      last_error         = NULL,
      consecutive_errors = 0
  WHERE id = p_source_id;
$$;

CREATE OR REPLACE FUNCTION public.kb_external_source_mark_error(
  p_source_id UUID,
  p_error     TEXT
)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ai_kb_external_sources
  SET last_synced_at     = now(),
      last_status        = 'error',
      last_error         = LEFT(p_error, 1000),
      consecutive_errors = consecutive_errors + 1
  WHERE id = p_source_id;
$$;

GRANT EXECUTE ON FUNCTION public.kb_external_source_mark_unchanged(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.kb_external_source_mark_error(UUID, TEXT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. pg_cron — daily run (06:00 UTC ≈ 07:00–08:00 Italia)
-- ───────────────────────────────────────────────────────────────────────────
-- Richiede secret kb_cron_secret in app.kb_cron_secret + URL già configurato.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('kb-sync-external-sources-daily');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Job non esisteva: ok
  NULL;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'kb-sync-external-sources-daily',
      '0 6 * * *',
      $cron$
      SELECT net.http_post(
        url:=current_setting('app.supabase_url', true) || '/functions/v1/kb-sync-external-sources',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.kb_cron_secret', true)
        ),
        body:='{"source": "pg_cron_daily"}'::jsonb,
        timeout_milliseconds:=300000
      ) AS request_id;
      $cron$
    );
  END IF;
END$$;

COMMIT;
