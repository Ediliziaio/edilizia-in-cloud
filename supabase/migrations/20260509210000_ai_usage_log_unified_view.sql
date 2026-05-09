-- ai_usage_log unified VIEW
-- ════════════════════════════════════════════════════════════════════════════
-- Il hook useAIUsageMonitor (frontend) si aspetta una tabella `ai_usage_log`
-- con schema (company_id, model, provider, cost_eur, feature, created_at) che
-- però NON esiste nel DB.
--
-- Le sorgenti reali di dati sono frammentate su 3-4 tabelle diverse create
-- in momenti diversi (ai_router_usage_log, ai_test_runs, ai_model_usage_log,
-- ai_usage_logs plurale).
--
-- Soluzione: creare una VIEW che unifica le sorgenti, presentando lo schema
-- atteso dal frontend. Backwards-compatible (no modifiche al codice React).
--
-- USD → EUR conversion: USD * 0.92 (cambio approssimativo, come da aiRouter).
-- Markup: applichiamo factor 2.0 di default per stimare il revenue customer.
-- ════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.ai_usage_log CASCADE;

CREATE VIEW public.ai_usage_log
WITH (security_invoker = true) AS
-- Sorgente 1: ai_router_usage_log (tracking generale aiRouterComplete)
SELECT
  id,
  company_id,
  model_used AS model,
  -- Provider derivato dal model prefix (openai/, anthropic/, ecc.)
  COALESCE(
    NULLIF(split_part(COALESCE(model_used, ''), '/', 1), ''),
    'unknown'
  ) AS provider,
  COALESCE(cost_usd, 0) * 0.92 AS cost_eur,
  -- Feature derivata dal task_key (heuristica)
  CASE
    WHEN task_key LIKE 'preventivo_%' OR task_key LIKE '%_preventivo%' THEN 'doc_analysis'
    WHEN task_key LIKE 'silvio_%' OR task_key LIKE '%_chat' OR task_key LIKE 'chat_%' THEN 'chat'
    WHEN task_key LIKE 'vision_%' OR task_key LIKE '%_vision%' OR task_key LIKE '%_ocr' THEN 'doc_analysis'
    WHEN task_key LIKE '%audio%' OR task_key LIKE '%transcribe%' OR task_key LIKE '%tts%' THEN 'voice'
    WHEN task_key LIKE 'public_chat' OR task_key LIKE 'lead_%' THEN 'chat'
    WHEN task_key LIKE '%automation%' OR task_key LIKE '%campaign%' THEN 'automation'
    ELSE 'other'
  END AS feature,
  created_at,
  task_key,
  user_id,
  total_tokens AS tokens_total,
  status,
  'ai_router_usage_log'::text AS source_table
FROM public.ai_router_usage_log
WHERE status = 'success' OR status IS NULL

UNION ALL

-- Sorgente 2: ai_test_runs (Test Lab)
SELECT
  id,
  company_id,
  model_id AS model,
  provider,
  COALESCE(cost_usd, 0) * 0.92 AS cost_eur,
  CASE
    WHEN feature LIKE '%chat%' THEN 'chat'
    WHEN feature LIKE '%foto%' OR feature LIKE '%vision%' OR feature LIKE '%doc%' THEN 'doc_analysis'
    WHEN feature LIKE '%audio%' OR feature LIKE '%voice%' THEN 'voice'
    WHEN feature LIKE '%council%' OR feature LIKE '%orchestrator%' THEN 'automation'
    WHEN feature LIKE '%computo%' OR feature LIKE '%capture%' THEN 'doc_analysis'
    ELSE 'other'
  END AS feature,
  created_at,
  task_key,
  user_id,
  COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS tokens_total,
  CASE WHEN error IS NULL OR error = '' THEN 'success' ELSE 'error' END AS status,
  'ai_test_runs'::text AS source_table
FROM public.ai_test_runs

UNION ALL

-- Sorgente 3: ai_model_usage_log (legacy fallback, billing dettagliato)
SELECT
  id,
  company_id,
  model_used AS model,
  provider_used AS provider,
  COALESCE(cost_real_eur, cost_usd * 0.92, 0) AS cost_eur,
  CASE
    WHEN task_kind LIKE '%chat%' THEN 'chat'
    WHEN task_kind LIKE '%vision%' OR task_kind LIKE '%doc%' THEN 'doc_analysis'
    WHEN task_kind LIKE '%audio%' OR task_kind LIKE '%voice%' THEN 'voice'
    WHEN task_kind LIKE '%automation%' THEN 'automation'
    ELSE 'other'
  END AS feature,
  ts AS created_at,
  task_kind AS task_key,
  NULL::uuid AS user_id,
  COALESCE(tokens_total, 0) AS tokens_total,
  CASE WHEN ok THEN 'success' ELSE 'error' END AS status,
  'ai_model_usage_log'::text AS source_table
FROM public.ai_model_usage_log;

-- RLS: la VIEW usa security_invoker, quindi rispetta le policy delle tabelle
-- sottostanti (super_admin via has_role, company_id via get_user_company_id).
-- Aggiungiamo comunque un commento per documentare.
COMMENT ON VIEW public.ai_usage_log IS
  'VIEW unificata sopra ai_router_usage_log + ai_test_runs + ai_model_usage_log. '
  'Schema atteso da useAIUsageMonitor (frontend). USD→EUR convertito a 0.92. '
  'Feature derivata da task_key/feature heuristics. '
  'Aggiunto da migration 20260509210000_ai_usage_log_unified_view.';

DO $$ BEGIN RAISE NOTICE 'ai_usage_log unified view created over 3 source tables'; END $$;
