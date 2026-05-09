-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT V2 #1 — Self-improvement loop cron settimanale
-- -----------------------------------------------------------------------
-- Ogni domenica alle 03:00, Silvio analizza le risposte degli ultimi 7gg
-- valutate da Florin (👍/👎):
--   • TOP rated (rating=5, count>=2 stesso pattern) → embed in
--     ai_brain_documents come 'gold_standard_pattern' (scope=silvio_admin)
--   • BOTTOM rated (rating=1) → embed come 'avoid_pattern' (negative example)
--   • Pattern citati >=5x con avg_rating>=4 → auto-promossi in
--     silvio_persona_memory come 'pattern' / source='feedback_loop'
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabella tracking miglioramento (telemetria + audit)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_self_improvement_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  -- counters
  runs_analyzed   INT DEFAULT 0,
  gold_added      INT DEFAULT 0,
  avoid_added     INT DEFAULT 0,
  promoted_to_memory INT DEFAULT 0,
  -- raw outputs
  gold_samples    JSONB,
  avoid_samples   JSONB,
  errors          JSONB,
  duration_ms     INT,
  ok              BOOLEAN DEFAULT true
);

ALTER TABLE public.silvio_self_improvement_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self_improvement_super" ON public.silvio_self_improvement_log;
CREATE POLICY "self_improvement_super" ON public.silvio_self_improvement_log
  FOR SELECT TO authenticated
  USING (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "self_improvement_service" ON public.silvio_self_improvement_log;
CREATE POLICY "self_improvement_service" ON public.silvio_self_improvement_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC silvio_self_improvement_aggregate — produce dataset per edge fn
-- -----------------------------------------------------------------------
-- Ritorna 2 array: top_rated + bottom_rated da elaborare
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_self_improvement_aggregate(
  p_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role TEXT;
  v_top JSONB;
  v_bottom JSONB;
  v_total INT;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' AND NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Top rated: user_rating=5, prendiamo response + prompt + persona
  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_top
  FROM (
    SELECT
      r.id          AS run_id,
      r.model_id,
      r.feature,
      r.user_rating,
      r.created_at,
      r.metadata->>'persona_key' AS persona_key,
      LEFT(COALESCE(r.metadata->>'response_excerpt', r.metadata->>'response', ''), 1200) AS response_excerpt,
      LEFT(COALESCE(r.metadata->>'prompt_excerpt', r.metadata->>'prompt', ''), 600) AS prompt_excerpt
    FROM public.ai_test_runs r
    WHERE r.feature = 'silvio_admin_chat'
      AND r.user_rating = 5
      AND r.created_at >= now() - (p_days || ' days')::interval
    ORDER BY r.created_at DESC
    LIMIT 50
  ) t;

  -- Bottom rated: user_rating=1
  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_bottom
  FROM (
    SELECT
      r.id          AS run_id,
      r.model_id,
      r.feature,
      r.user_rating,
      r.created_at,
      r.metadata->>'persona_key' AS persona_key,
      LEFT(COALESCE(r.metadata->>'response_excerpt', r.metadata->>'response', ''), 1200) AS response_excerpt,
      LEFT(COALESCE(r.metadata->>'prompt_excerpt', r.metadata->>'prompt', ''), 600) AS prompt_excerpt
    FROM public.ai_test_runs r
    WHERE r.feature = 'silvio_admin_chat'
      AND r.user_rating = 1
      AND r.created_at >= now() - (p_days || ' days')::interval
    ORDER BY r.created_at DESC
    LIMIT 50
  ) t;

  SELECT count(*) INTO v_total
  FROM public.ai_test_runs
  WHERE feature = 'silvio_admin_chat'
    AND user_rating IS NOT NULL
    AND created_at >= now() - (p_days || ' days')::interval;

  RETURN jsonb_build_object(
    'period_days', p_days,
    'period_end', now(),
    'period_start', now() - (p_days || ' days')::interval,
    'total_rated_runs', v_total,
    'top_rated', v_top,
    'bottom_rated', v_bottom
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_self_improvement_aggregate(INT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC silvio_self_improvement_promote — promuove pattern usati a memoria
-- -----------------------------------------------------------------------
-- Pattern in ai_brain_documents con scope=silvio_admin, kb_section LIKE
-- 'gold_standard_%' che hanno hits_count >= 5 e avg rating >= 4 vanno
-- promossi in silvio_persona_memory (memory_type='pattern')
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_self_improvement_promote()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role TEXT;
  v_promoted INT := 0;
  r RECORD;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' AND NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Pattern gold candidati alla promozione: hits>=5
  FOR r IN
    SELECT
      d.id,
      d.title,
      d.content,
      d.persona_keys,
      COALESCE((d.metadata->>'hits_count')::int, 0) AS hits,
      COALESCE((d.metadata->>'source_run_id'), '') AS source_run_id
    FROM public.ai_brain_documents d
    WHERE d.scope = 'silvio_admin'
      AND d.kb_section = 'gold_standard'
      AND COALESCE((d.metadata->>'hits_count')::int, 0) >= 5
      AND NOT COALESCE((d.metadata->>'promoted_to_memory')::boolean, false)
  LOOP
    -- Inserisci memoria per ogni persona collegata
    IF r.persona_keys IS NOT NULL AND array_length(r.persona_keys, 1) > 0 THEN
      INSERT INTO public.silvio_persona_memory (
        persona_key, memory_type, content, source, confidence, enabled
      )
      SELECT
        unnest(r.persona_keys),
        'pattern',
        '✅ PATTERN VINCENTE: ' || LEFT(r.content, 400),
        'feedback_loop',
        0.85,
        true
      ON CONFLICT DO NOTHING;

      v_promoted := v_promoted + 1;
    END IF;

    -- Marca come promosso
    UPDATE public.ai_brain_documents
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'promoted_to_memory', true,
      'promoted_at', now()
    )
    WHERE id = r.id;
  END LOOP;

  -- Pattern AVOID con hits>=3 → memoria 'avoid'
  FOR r IN
    SELECT
      d.id, d.title, d.content, d.persona_keys,
      COALESCE((d.metadata->>'hits_count')::int, 0) AS hits
    FROM public.ai_brain_documents d
    WHERE d.scope = 'silvio_admin'
      AND d.kb_section = 'avoid_pattern'
      AND COALESCE((d.metadata->>'hits_count')::int, 0) >= 3
      AND NOT COALESCE((d.metadata->>'promoted_to_memory')::boolean, false)
  LOOP
    IF r.persona_keys IS NOT NULL AND array_length(r.persona_keys, 1) > 0 THEN
      INSERT INTO public.silvio_persona_memory (
        persona_key, memory_type, content, source, confidence, enabled
      )
      SELECT
        unnest(r.persona_keys),
        'avoid',
        '❌ DA EVITARE: ' || LEFT(r.content, 400),
        'feedback_loop',
        0.85,
        true
      ON CONFLICT DO NOTHING;

      v_promoted := v_promoted + 1;
    END IF;

    UPDATE public.ai_brain_documents
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'promoted_to_memory', true,
      'promoted_at', now()
    )
    WHERE id = r.id;
  END LOOP;

  RETURN v_promoted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_self_improvement_promote() TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Cron settimanale — ogni Domenica 03:00
-- -----------------------------------------------------------------------
-- Chiama l'edge function silvio-self-improvement che:
--  1. Legge dataset via silvio_self_improvement_aggregate
--  2. Per ogni gold/avoid: chiama OpenAI embeddings + insert in
--     ai_brain_documents (scope='silvio_admin', kb_section='gold_standard'|'avoid_pattern')
--  3. Chiama silvio_self_improvement_promote per memoria personas
--  4. Logga in silvio_self_improvement_log
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key  := current_setting('app.settings.service_role_key', true);

  -- Drop esistente se presente
  PERFORM cron.unschedule('silvio-self-improvement-weekly')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'silvio-self-improvement-weekly'
  );

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM cron.schedule(
      'silvio-self-improvement-weekly',
      '0 3 * * 0',  -- Domenica 03:00 UTC
      format($cron$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || %L
          ),
          body := jsonb_build_object('source', 'cron_weekly')
        );
      $cron$, v_supabase_url || '/functions/v1/silvio-self-improvement', v_service_key)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cron self-improvement non schedulato: %', SQLERRM;
END $$;

COMMIT;
