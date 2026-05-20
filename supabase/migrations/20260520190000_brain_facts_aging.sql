-- ============================================================================
-- brain_facts_aging — aging automatico delle memorie AI long-term
-- ----------------------------------------------------------------------------
-- Aggiunge tracking dell'ultima volta che un fact è stato CARICATO nel
-- contesto AI (`last_used_at`) e `hit_count` per misurare la rilevanza.
--
-- Permette future cron aging-policy:
--   - Fact con last_used_at < NOW() - 90gg → confidence × 0.95 (decay)
--   - Fact con confidence < 0.3 → soft-delete (impostare flag enabled=false)
--
-- Per ora aggiungiamo solo i campi + RPC `brain_touch_facts` chiamata da
-- silvio_get_memory_context. La cron decay verrà aggiunta in un secondo step.
-- ============================================================================

-- 1. Aggiungi colonne se mancanti (idempotent)
ALTER TABLE public.ai_brain_facts
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS hit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- 2. Indice per query "facts attivi recenti"
CREATE INDEX IF NOT EXISTS idx_brain_facts_active_recent
  ON public.ai_brain_facts (company_id, enabled, last_used_at DESC NULLS LAST)
  WHERE enabled = true;

-- 3. RPC: touch facts — chiamata da silvio_get_memory_context per i facts
--    effettivamente ritornati. Aggiorna last_used_at + incrementa hit_count.
CREATE OR REPLACE FUNCTION public.brain_touch_facts(
  p_company_id uuid,
  p_fact_keys text[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ai_brain_facts
  SET last_used_at = now(),
      hit_count = hit_count + 1
  WHERE company_id = p_company_id
    AND fact_key = ANY(p_fact_keys);
$$;

REVOKE ALL ON FUNCTION public.brain_touch_facts(uuid, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_touch_facts(uuid, text[]) TO service_role;

-- 4. Aggiorna silvio_get_memory_context per filtrare solo facts abilitati
--    e ritornare le info aging-relevant.
CREATE OR REPLACE FUNCTION public.silvio_get_memory_context(
  p_company_id uuid,
  p_user_id uuid,
  p_max_summaries int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facts jsonb;
  v_summaries jsonb;
BEGIN
  -- Top facts azienda (priority by confidence + recency d'uso)
  -- WHERE enabled=true filtra le memorie soft-deleted dall'aging policy.
  SELECT jsonb_agg(jsonb_build_object(
    'key', fact_key,
    'value', fact_value,
    'confidence', confidence,
    'source', source,
    'hit_count', hit_count,
    'last_used_at', last_used_at
  ) ORDER BY confidence DESC, COALESCE(last_used_at, updated_at) DESC) INTO v_facts
  FROM public.ai_brain_facts
  WHERE company_id = p_company_id
    AND confidence >= 0.5
    AND enabled = true;

  -- Top N summaries recenti (per questo utente)
  SELECT jsonb_agg(jsonb_build_object(
    'period', jsonb_build_object('start', period_start, 'end', period_end),
    'summary', summary,
    'topics', topics,
    'key_facts', key_facts
  ) ORDER BY period_end DESC) INTO v_summaries
  FROM (
    SELECT * FROM public.ai_brain_chat_summaries
    WHERE user_id = p_user_id
    ORDER BY period_end DESC
    LIMIT GREATEST(LEAST(p_max_summaries, 10), 1)
  ) x;

  RETURN jsonb_build_object(
    'facts', COALESCE(v_facts, '[]'::jsonb),
    'recent_summaries', COALESCE(v_summaries, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_get_memory_context(uuid, uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_get_memory_context(uuid, uuid, int) TO authenticated, service_role;

-- 5. Cron-callable RPC per aging: decay confidence dei facts non usati.
--    Applica:
--      - Fact con last_used_at IS NULL e created_at < NOW() - 60gg → confidence -0.1
--      - Fact con last_used_at < NOW() - 90gg → confidence × 0.9
--      - Se confidence post-decay < 0.3 → enabled=false
--    Da chiamare via cron job notturno (es. una volta al giorno).
CREATE OR REPLACE FUNCTION public.brain_age_facts(
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decayed int := 0;
  v_disabled int := 0;
BEGIN
  -- Decay 1: facts mai usati creati >60gg fa
  UPDATE public.ai_brain_facts
  SET confidence = GREATEST(0, confidence - 0.1)
  WHERE enabled = true
    AND last_used_at IS NULL
    AND created_at < NOW() - INTERVAL '60 days'
    AND (p_company_id IS NULL OR company_id = p_company_id);
  GET DIAGNOSTICS v_decayed = ROW_COUNT;

  -- Decay 2: facts usati ma stale (>90gg dall'ultimo uso)
  UPDATE public.ai_brain_facts
  SET confidence = ROUND((confidence * 0.9)::numeric, 2)
  WHERE enabled = true
    AND last_used_at < NOW() - INTERVAL '90 days'
    AND (p_company_id IS NULL OR company_id = p_company_id);
  GET DIAGNOSTICS v_decayed = v_decayed + ROW_COUNT;

  -- Soft-delete: confidence troppo bassa
  UPDATE public.ai_brain_facts
  SET enabled = false
  WHERE enabled = true
    AND confidence < 0.3
    AND (p_company_id IS NULL OR company_id = p_company_id);
  GET DIAGNOSTICS v_disabled = ROW_COUNT;

  RETURN jsonb_build_object(
    'decayed', v_decayed,
    'disabled', v_disabled,
    'aged_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.brain_age_facts(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_age_facts(uuid) TO service_role;

COMMENT ON FUNCTION public.brain_age_facts IS
'Aging policy per ai_brain_facts. Da chiamare via cron notturno. Decay confidence di facts inutilizzati, soft-delete sotto soglia 0.3.';
