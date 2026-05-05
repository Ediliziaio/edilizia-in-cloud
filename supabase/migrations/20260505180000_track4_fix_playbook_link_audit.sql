-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 4 — FIX: link decision_log → playbook_definitions (text vs uuid)
-- ════════════════════════════════════════════════════════════════════════════
-- BUG rilevato in audit:
--   silvio_decision_log.playbook_id era uuid ma silvio_playbook_definitions.id
--   è text → impossibile JOIN. Inoltre silvio_decision_log_propose NON popolava
--   il campo playbook_id, quindi silvio_playbook_performance ritornava 0.
--
-- FIX:
--   1. ALTER playbook_id da uuid → text
--   2. Aggiungi parametro p_playbook_id a silvio_decision_log_propose
--   3. Riscrivi silvio_playbook_performance per usare colonna playbook_id
--      invece di trigger_metadata->>'playbook_id'
--   4. Aggiorna anche silvio-playbook-execute (in codice) per passare playbook_id
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Cambia tipo colonna playbook_id da uuid a text
ALTER TABLE public.silvio_decision_log
  ALTER COLUMN playbook_id TYPE text USING playbook_id::text;

CREATE INDEX IF NOT EXISTS idx_decision_log_playbook ON public.silvio_decision_log (playbook_id) WHERE playbook_id IS NOT NULL;

-- 2) Estendi silvio_decision_log_propose con p_playbook_id
DROP FUNCTION IF EXISTS public.silvio_decision_log_propose(uuid,text,text,text,uuid,text,text,jsonb,jsonb,text,text,jsonb,boolean,text[],text,int,numeric);

CREATE OR REPLACE FUNCTION public.silvio_decision_log_propose(
  p_company_id uuid,
  p_persona_key text,
  p_trigger_type text,
  p_trigger_source_type text,
  p_trigger_source_id uuid,
  p_situation text,
  p_diagnosis text DEFAULT NULL,
  p_diagnosis_data jsonb DEFAULT '{}'::jsonb,
  p_options jsonb DEFAULT '[]'::jsonb,
  p_recommended text DEFAULT NULL,
  p_confidence text DEFAULT 'medium',
  p_kpis_to_track jsonb DEFAULT '[]'::jsonb,
  p_is_critical boolean DEFAULT false,
  p_tags text[] DEFAULT '{}',
  p_ai_model text DEFAULT NULL,
  p_ai_tokens int DEFAULT NULL,
  p_ai_cost_eur numeric DEFAULT NULL,
  p_playbook_id text DEFAULT NULL,
  p_trigger_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.silvio_decision_log (
    company_id, persona_key,
    trigger_type, trigger_source_type, trigger_source_id, trigger_metadata,
    situation_description, ai_diagnosis, ai_diagnosis_data,
    ai_options_proposed, ai_recommended_option_id, ai_confidence_level,
    ai_model_used, ai_tokens_total, ai_cost_eur,
    outcome_kpis_tracked, is_critical, tags,
    playbook_id,
    status
  ) VALUES (
    p_company_id, p_persona_key,
    p_trigger_type, p_trigger_source_type, p_trigger_source_id, COALESCE(p_trigger_metadata, '{}'::jsonb),
    p_situation, p_diagnosis, p_diagnosis_data,
    p_options, p_recommended, p_confidence,
    p_ai_model, p_ai_tokens, p_ai_cost_eur,
    p_kpis_to_track, p_is_critical, p_tags,
    p_playbook_id,
    'pending_review'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_decision_log_propose(uuid,text,text,text,uuid,text,text,jsonb,jsonb,text,text,jsonb,boolean,text[],text,int,numeric,text,jsonb)
  TO authenticated, service_role;

-- 3) Backfill: collega decision_log esistenti ai playbook se trigger_source_type = silvio_playbook_definitions
-- I 2 record esistenti hanno trigger_source_id NULL ma sono per tensione-cassa-30gg (override testati)
-- Backfilliamo manualmente solo questi (sono test, non dati produttivi)
UPDATE public.silvio_decision_log
SET playbook_id = 'tensione-cassa-30gg'
WHERE trigger_source_type = 'silvio_playbook_definitions'
  AND playbook_id IS NULL
  AND created_at < now();  -- tutti i pre-esistenti

-- 4) Riscrivi silvio_playbook_performance per usare colonna playbook_id
CREATE OR REPLACE FUNCTION public.silvio_playbook_performance(
  p_playbook_id text,
  p_days_back int DEFAULT 90
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'playbook_id', p_playbook_id,
    'period_days', p_days_back,
    'proposed_count', count(*),
    'decided_count', count(*) FILTER (WHERE status != 'pending_review'),
    'executed_count', count(*) FILTER (WHERE status = 'executed'),
    'abandoned_count', count(*) FILTER (WHERE status = 'abandoned'),
    'recommendation_acceptance_rate', ROUND(100.0 * count(*) FILTER (WHERE user_chosen_option_id = ai_recommended_option_id) / NULLIF(count(*) FILTER (WHERE ai_recommended_option_id IS NOT NULL AND user_chosen_option_id IS NOT NULL), 0), 1),
    'success_rate_pct', ROUND(100.0 * count(*) FILTER (WHERE outcome_evaluation = 'successful') / NULLIF(count(*) FILTER (WHERE outcome_evaluation IS NOT NULL), 0), 1),
    'avg_decision_time_hours', ROUND((AVG(EXTRACT(epoch FROM (decided_at - created_at))/3600.0))::numeric, 1),
    'option_distribution', (
      SELECT jsonb_object_agg(opt_id, cnt)
      FROM (
        SELECT user_chosen_option_id AS opt_id, count(*) AS cnt
        FROM public.silvio_decision_log
        WHERE playbook_id = p_playbook_id
          AND created_at >= now() - (p_days_back * interval '1 day')
          AND user_chosen_option_id IS NOT NULL
        GROUP BY user_chosen_option_id
      ) sub
    )
  )
  FROM public.silvio_decision_log
  WHERE
    playbook_id = p_playbook_id
    AND created_at >= now() - (p_days_back * interval '1 day');
$$;

GRANT EXECUTE ON FUNCTION public.silvio_playbook_performance(text, int) TO authenticated, service_role;

-- 5) Verifica
DO $$
DECLARE v_perf jsonb;
BEGIN
  v_perf := public.silvio_playbook_performance('tensione-cassa-30gg', 90);
  IF (v_perf->>'proposed_count')::int < 1 THEN
    RAISE WARNING 'silvio_playbook_performance ancora ritorna 0, backfill non funzionante';
  ELSE
    RAISE NOTICE 'OK: silvio_playbook_performance ritorna proposed_count=% per tensione-cassa-30gg', v_perf->>'proposed_count';
  END IF;
END $$;

COMMIT;
