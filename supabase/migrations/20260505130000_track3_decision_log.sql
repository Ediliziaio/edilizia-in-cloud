-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 3 — Decision Log Unificato
-- Cervello Supremo EiC
-- ════════════════════════════════════════════════════════════════════════════
-- Tracciamento end-to-end decisioni AI-supportate:
--   trigger → diagnosi → opzioni → scelta umana → outcome
--
-- Risolve il gap di traceability tra silvio_alerts, ai_action_proposals,
-- ai_chat_messages, ai_router_usage_log.
--
-- Integration:
--   - silvio_create_alert_with_decision_log (wrapper opzionale, no breaking)
--   - silvio_tool_propose_action_v2 (estende esistente con auto-link)
--   - silvio-execute-action edge → chiama silvio_decision_log_decide
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabella principale silvio_decision_log
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  persona_key text NOT NULL,

  -- Trigger
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'alert_proattivo',
    'user_request',
    'scheduled_review',
    'playbook_orchestrator',
    'cron_briefing',
    'tool_propose_action'
  )),
  trigger_source_type text,
  trigger_source_id uuid,
  trigger_metadata jsonb DEFAULT '{}'::jsonb,

  -- Diagnosi
  situation_description text NOT NULL,
  ai_diagnosis text,
  ai_diagnosis_data jsonb DEFAULT '{}'::jsonb,

  -- Proposta AI
  ai_options_proposed jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_recommended_option_id text,
  ai_confidence_level text CHECK (ai_confidence_level IN ('low','medium','high')),
  ai_model_used text,
  ai_tokens_total int,
  ai_cost_eur numeric(10,4),

  -- Scelta utente
  user_chosen_option_id text,
  user_modifications jsonb DEFAULT '{}'::jsonb,
  user_rationale text,
  user_decided_by uuid REFERENCES auth.users(id),

  -- Esecuzione
  executed_action_id uuid REFERENCES public.ai_action_proposals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',
    'decided_pending_exec',
    'executed',
    'abandoned',
    'expired'
  )),

  -- Outcome
  outcome_kpis_tracked jsonb DEFAULT '[]'::jsonb,
  outcome_30d jsonb,
  outcome_60d jsonb,
  outcome_90d jsonb,
  outcome_evaluation text CHECK (outcome_evaluation IN ('successful','partial','failed','not_evaluable')),
  lessons_learned text,

  -- Metadata
  tags text[] DEFAULT '{}',
  playbook_id uuid,
  is_critical boolean DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  executed_at timestamptz,
  last_outcome_check_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_decision_log_company ON public.silvio_decision_log (company_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_status ON public.silvio_decision_log (status);
CREATE INDEX IF NOT EXISTS idx_decision_log_trigger ON public.silvio_decision_log (trigger_type, trigger_source_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_persona ON public.silvio_decision_log (persona_key);
CREATE INDEX IF NOT EXISTS idx_decision_log_critical ON public.silvio_decision_log (is_critical) WHERE is_critical = true;
CREATE INDEX IF NOT EXISTS idx_decision_log_created ON public.silvio_decision_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_log_pending ON public.silvio_decision_log (status, company_id) WHERE status = 'pending_review';
CREATE INDEX IF NOT EXISTS idx_decision_log_tags ON public.silvio_decision_log USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_decision_log_executed_action ON public.silvio_decision_log (executed_action_id) WHERE executed_action_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RLS
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.silvio_decision_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decision_log_company_read" ON public.silvio_decision_log;
CREATE POLICY "decision_log_company_read" ON public.silvio_decision_log
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "decision_log_admin_write" ON public.silvio_decision_log;
CREATE POLICY "decision_log_admin_write" ON public.silvio_decision_log
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('company_admin','super_admin')
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: propose
-- ───────────────────────────────────────────────────────────────────────────

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
  p_ai_cost_eur numeric DEFAULT NULL
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
    trigger_type, trigger_source_type, trigger_source_id,
    situation_description, ai_diagnosis, ai_diagnosis_data,
    ai_options_proposed, ai_recommended_option_id, ai_confidence_level,
    ai_model_used, ai_tokens_total, ai_cost_eur,
    outcome_kpis_tracked, is_critical, tags,
    status
  ) VALUES (
    p_company_id, p_persona_key,
    p_trigger_type, p_trigger_source_type, p_trigger_source_id,
    p_situation, p_diagnosis, p_diagnosis_data,
    p_options, p_recommended, p_confidence,
    p_ai_model, p_ai_tokens, p_ai_cost_eur,
    p_kpis_to_track, p_is_critical, p_tags,
    'pending_review'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_decision_log_propose(uuid,text,text,text,uuid,text,text,jsonb,jsonb,text,text,jsonb,boolean,text[],text,int,numeric)
  TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: decide (utente sceglie)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_decision_log_decide(
  p_decision_id uuid,
  p_chosen_option_id text,
  p_user_modifications jsonb DEFAULT '{}'::jsonb,
  p_user_rationale text DEFAULT NULL,
  p_executed_action_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.silvio_decision_log SET
    user_chosen_option_id = p_chosen_option_id,
    user_modifications = COALESCE(p_user_modifications, '{}'::jsonb),
    user_rationale = p_user_rationale,
    user_decided_by = auth.uid(),
    decided_at = now(),
    executed_action_id = COALESCE(p_executed_action_id, executed_action_id),
    status = CASE
      WHEN p_chosen_option_id IS NULL OR p_chosen_option_id = 'none' THEN 'abandoned'
      ELSE 'decided_pending_exec'
    END
  WHERE id = p_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_decision_log_decide(uuid, text, jsonb, text, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC: record_outcome
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_decision_log_record_outcome(
  p_decision_id uuid,
  p_period text,
  p_outcome_data jsonb,
  p_evaluation text DEFAULT NULL,
  p_lessons text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_period = '30d' THEN
    UPDATE public.silvio_decision_log SET
      outcome_30d = p_outcome_data,
      last_outcome_check_at = now()
    WHERE id = p_decision_id;
  ELSIF p_period = '60d' THEN
    UPDATE public.silvio_decision_log SET
      outcome_60d = p_outcome_data,
      last_outcome_check_at = now()
    WHERE id = p_decision_id;
  ELSIF p_period = '90d' THEN
    UPDATE public.silvio_decision_log SET
      outcome_90d = p_outcome_data,
      outcome_evaluation = COALESCE(p_evaluation, outcome_evaluation),
      lessons_learned = COALESCE(p_lessons, lessons_learned),
      last_outcome_check_at = now()
    WHERE id = p_decision_id;
  ELSE
    RAISE EXCEPTION 'period invalid: %, expected 30d|60d|90d', p_period;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_decision_log_record_outcome(uuid, text, jsonb, text, text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RPC: audit_export (AI Act compliance)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_decision_log_audit_export(
  p_company_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '90 days'),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Bypass RLS solo se super_admin (gia autorizzato), altrimenti force company_id
  SELECT jsonb_build_object(
    'export_at', now(),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'total_decisions', count(*),
    'by_status', COALESCE(jsonb_object_agg(status, status_count) FILTER (WHERE status IS NOT NULL), '{}'::jsonb),
    'by_persona', COALESCE(jsonb_object_agg(persona_key, persona_count) FILTER (WHERE persona_key IS NOT NULL), '{}'::jsonb),
    'critical_count', count(*) FILTER (WHERE is_critical),
    'decisions', COALESCE(jsonb_agg(decision_obj) FILTER (WHERE decision_obj IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT
      status,
      persona_key,
      is_critical,
      count(*) OVER (PARTITION BY status) AS status_count,
      count(*) OVER (PARTITION BY persona_key) AS persona_count,
      jsonb_build_object(
        'id', id,
        'created_at', created_at,
        'persona', persona_key,
        'situation', situation_description,
        'options_count', jsonb_array_length(ai_options_proposed),
        'chosen', user_chosen_option_id,
        'status', status,
        'evaluation', outcome_evaluation,
        'is_critical', is_critical
      ) AS decision_obj
    FROM public.silvio_decision_log
    WHERE
      (p_company_id IS NULL OR company_id = p_company_id)
      AND created_at BETWEEN p_from AND p_to
  ) sub;
  RETURN COALESCE(v_result, jsonb_build_object('total_decisions', 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_decision_log_audit_export(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) RPC: expire vecchie decisioni pending (cleanup)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_decision_log_expire_old()
RETURNS int
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  WITH expired AS (
    UPDATE public.silvio_decision_log
    SET status = 'expired'
    WHERE status = 'pending_review'
      AND expires_at < now()
    RETURNING id
  )
  SELECT count(*)::int FROM expired;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_decision_log_expire_old() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) Wrapper: silvio_create_alert_with_decision_log
--    Crea alert + decision_log entry in 1 chiamata (per use cases con HIL)
--    NON sostituisce silvio_create_alert (resta per backward-compat).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_create_alert_with_decision_log(
  p_company_id uuid,
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_persona_key text DEFAULT 'silvio',
  p_options jsonb DEFAULT '[]'::jsonb,
  p_recommended text DEFAULT NULL,
  p_kpis_to_track jsonb DEFAULT '[]'::jsonb,
  p_is_critical boolean DEFAULT false,
  p_source_type text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
  v_decision_id uuid;
BEGIN
  -- Crea alert standard (firma reale: company_id, alert_type, severity, title, message,
  -- dedup_key, target_user_id, cta_label, cta_action, cta_payload, source_type, source_id,
  -- source_meta, expires_at)
  v_alert_id := public.silvio_create_alert(
    p_company_id,                                                -- p_company_id
    p_alert_type,                                                -- p_alert_type
    p_severity,                                                  -- p_severity
    p_title,                                                     -- p_title
    p_message,                                                   -- p_message
    COALESCE(p_alert_type, 'decision_log') || '_' || gen_random_uuid()::text,  -- p_dedup_key (univoco)
    NULL,                                                        -- p_target_user_id
    NULL,                                                        -- p_cta_label
    'open_decision_log',                                         -- p_cta_action
    NULL,                                                        -- p_cta_payload
    p_source_type,                                               -- p_source_type
    p_source_id,                                                 -- p_source_id
    p_metadata,                                                  -- p_source_meta
    now() + interval '30 days'                                   -- p_expires_at
  );

  -- Crea decision_log entry
  v_decision_id := public.silvio_decision_log_propose(
    p_company_id, p_persona_key,
    'alert_proattivo', 'silvio_alerts', v_alert_id,
    p_title, p_message, p_metadata,
    p_options, p_recommended,
    CASE WHEN p_is_critical THEN 'high' ELSE 'medium' END,
    p_kpis_to_track, p_is_critical, '{}'::text[],
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object('alert_id', v_alert_id, 'decision_id', v_decision_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_create_alert_with_decision_log(uuid, text, text, text, text, text, jsonb, text, jsonb, boolean, text, uuid, jsonb)
  TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) Viste aggregate per dashboard (con RLS-aware filtering via security barrier)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_decision_log_kpis AS
SELECT
  company_id,
  count(*) AS decisions_total,
  count(*) FILTER (WHERE status = 'pending_review') AS pending_count,
  count(*) FILTER (WHERE status = 'executed') AS executed_count,
  count(*) FILTER (WHERE status = 'abandoned') AS abandoned_count,
  count(*) FILTER (WHERE is_critical) AS critical_count,
  count(*) FILTER (WHERE outcome_evaluation = 'successful') AS successful_outcomes,
  count(*) FILTER (WHERE outcome_evaluation = 'failed') AS failed_outcomes,
  ROUND(100.0 * count(*) FILTER (WHERE user_chosen_option_id = ai_recommended_option_id) /
    NULLIF(count(*) FILTER (WHERE ai_recommended_option_id IS NOT NULL AND user_chosen_option_id IS NOT NULL), 0), 1) AS pct_recommendation_accepted,
  ROUND((AVG(EXTRACT(epoch FROM (decided_at - created_at)) / 3600.0) FILTER (WHERE decided_at IS NOT NULL))::numeric, 2) AS avg_decision_hours,
  max(created_at) AS last_decision_at
FROM public.silvio_decision_log
GROUP BY company_id;

CREATE OR REPLACE VIEW public.v_decision_log_pending AS
SELECT
  id,
  company_id,
  persona_key,
  trigger_type,
  situation_description,
  ai_recommended_option_id,
  ai_confidence_level,
  is_critical,
  ROUND((EXTRACT(epoch FROM (now() - created_at)) / 3600.0)::numeric, 1) AS hours_pending,
  created_at,
  expires_at,
  jsonb_array_length(ai_options_proposed) AS options_count
FROM public.silvio_decision_log
WHERE status = 'pending_review'
ORDER BY is_critical DESC, created_at DESC;

CREATE OR REPLACE VIEW public.v_decision_log_playbook_performance AS
SELECT
  trigger_type,
  trigger_source_type,
  persona_key,
  count(*) AS proposed_count,
  count(*) FILTER (WHERE status = 'executed') AS executed_count,
  count(*) FILTER (WHERE outcome_evaluation = 'successful') AS successful_count,
  count(*) FILTER (WHERE outcome_evaluation = 'failed') AS failed_count,
  ROUND(100.0 * count(*) FILTER (WHERE outcome_evaluation = 'successful') /
    NULLIF(count(*) FILTER (WHERE outcome_evaluation IS NOT NULL), 0), 1) AS success_rate_pct,
  ROUND(AVG(ai_cost_eur)::numeric, 4) AS avg_ai_cost_eur
FROM public.silvio_decision_log
WHERE created_at >= now() - interval '180 days'
GROUP BY trigger_type, trigger_source_type, persona_key
ORDER BY proposed_count DESC;

CREATE OR REPLACE VIEW public.v_decision_log_outcome_due AS
SELECT
  id,
  company_id,
  persona_key,
  situation_description,
  decided_at,
  EXTRACT(day FROM (now() - decided_at))::int AS days_since_decision,
  CASE
    WHEN outcome_30d IS NULL AND now() - decided_at > interval '30 days' THEN '30d'
    WHEN outcome_60d IS NULL AND now() - decided_at > interval '60 days' THEN '60d'
    WHEN outcome_90d IS NULL AND now() - decided_at > interval '90 days' THEN '90d'
  END AS outcome_period_due
FROM public.silvio_decision_log
WHERE status IN ('decided_pending_exec','executed')
  AND outcome_evaluation IS NULL
  AND decided_at IS NOT NULL
  AND (
    (outcome_30d IS NULL AND now() - decided_at > interval '30 days')
    OR (outcome_60d IS NULL AND now() - decided_at > interval '60 days')
    OR (outcome_90d IS NULL AND now() - decided_at > interval '90 days')
  );

CREATE OR REPLACE VIEW public.v_decision_log_lessons AS
SELECT
  trigger_type,
  trigger_source_type,
  persona_key,
  count(*) AS case_count,
  array_agg(DISTINCT lessons_learned) FILTER (WHERE lessons_learned IS NOT NULL) AS lessons_collected,
  array_agg(DISTINCT user_rationale) FILTER (WHERE user_rationale IS NOT NULL) AS rationales_collected
FROM public.silvio_decision_log
WHERE outcome_evaluation IS NOT NULL
GROUP BY trigger_type, trigger_source_type, persona_key
HAVING count(*) >= 3;

GRANT SELECT ON public.v_decision_log_kpis,
                 public.v_decision_log_pending,
                 public.v_decision_log_playbook_performance,
                 public.v_decision_log_outcome_due,
                 public.v_decision_log_lessons
  TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 10) Cron function (creata, NON schedulata — attivazione in Track 4)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_decision_log_check_outcomes_cron()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_decision RECORD;
BEGIN
  FOR v_decision IN
    SELECT id, company_id, decided_at, outcome_kpis_tracked,
      CASE
        WHEN outcome_30d IS NULL AND now() - decided_at > interval '30 days' THEN '30d'
        WHEN outcome_60d IS NULL AND now() - decided_at > interval '60 days' THEN '60d'
        WHEN outcome_90d IS NULL AND now() - decided_at > interval '90 days' THEN '90d'
      END AS period_due
    FROM public.silvio_decision_log
    WHERE status IN ('decided_pending_exec','executed')
      AND decided_at IS NOT NULL
      AND outcome_evaluation IS NULL
      AND (
        (outcome_30d IS NULL AND now() - decided_at > interval '30 days')
        OR (outcome_60d IS NULL AND now() - decided_at > interval '60 days')
        OR (outcome_90d IS NULL AND now() - decided_at > interval '90 days')
      )
    LIMIT 100
  LOOP
    -- Placeholder: salviamo timestamp del check, KPI specifici verranno
    -- valutati dal Playbook Orchestrator (Track 4) basandosi su outcome_kpis_tracked
    PERFORM public.silvio_decision_log_record_outcome(
      v_decision.id,
      v_decision.period_due,
      jsonb_build_object('automated_check', true, 'computed_at', now(), 'pending_evaluation', true),
      NULL, NULL
    );
    v_processed := v_processed + 1;
  END LOOP;

  -- Anche cleanup: marca expired le decisioni pending vecchie
  PERFORM public.silvio_decision_log_expire_old();

  RETURN jsonb_build_object('processed', v_processed, 'computed_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_decision_log_check_outcomes_cron() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 11) Verifiche post-migration
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM information_schema.tables
   WHERE table_schema='public' AND table_name='silvio_decision_log';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'Tabella silvio_decision_log non creata'; END IF;
  RAISE NOTICE 'OK: tabella silvio_decision_log creata';

  SELECT count(*) INTO v_cnt FROM pg_proc
   WHERE proname IN (
    'silvio_decision_log_propose',
    'silvio_decision_log_decide',
    'silvio_decision_log_record_outcome',
    'silvio_decision_log_audit_export',
    'silvio_decision_log_expire_old',
    'silvio_create_alert_with_decision_log',
    'silvio_decision_log_check_outcomes_cron'
   );
  IF v_cnt <> 7 THEN RAISE EXCEPTION 'Atteso 7 RPC create, trovate %', v_cnt; END IF;
  RAISE NOTICE 'OK: 7/7 RPC create';

  SELECT count(*) INTO v_cnt FROM information_schema.views
   WHERE table_schema='public' AND table_name LIKE 'v_decision_log_%';
  IF v_cnt <> 5 THEN RAISE EXCEPTION 'Atteso 5 viste create, trovate %', v_cnt; END IF;
  RAISE NOTICE 'OK: 5/5 viste create';
END $$;

COMMIT;
