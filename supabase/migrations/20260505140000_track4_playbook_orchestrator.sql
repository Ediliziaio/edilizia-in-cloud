-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 4 — Playbook Orchestrator
-- Cervello Supremo EiC
-- ════════════════════════════════════════════════════════════════════════════
-- Tabella + RPC + AI router task per orchestrazione playbook che trasformano
-- trigger in proposte strutturate (situazione/diagnosi/opzioni/raccomandazione).
--
-- Il playbook seed (tensione-cassa-30gg) viene caricato qui per validare il
-- match end-to-end. I prossimi playbook si aggiungono via INSERT (no migration
-- richiesta).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabella silvio_playbook_definitions
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_playbook_definitions (
  id text PRIMARY KEY,
  version text NOT NULL DEFAULT '1.0',
  category text NOT NULL,
  advisory_level int CHECK (advisory_level BETWEEN 1 AND 5),
  title text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 50,

  triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_gathering jsonb NOT NULL DEFAULT '[]'::jsonb,
  diagnosis_questions text[] DEFAULT '{}',
  options_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  anti_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalation jsonb DEFAULT '{}'::jsonb,
  kpis_to_track jsonb NOT NULL DEFAULT '[]'::jsonb,
  kb_context_areas text[] DEFAULT '{}',

  ai_prompt_template text NOT NULL,
  ai_router_task_key text NOT NULL DEFAULT 'playbook_advisor',
  max_tokens_per_call int DEFAULT 2000,

  is_critical boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_playbook_def_category ON public.silvio_playbook_definitions (category);
CREATE INDEX IF NOT EXISTS idx_playbook_def_enabled ON public.silvio_playbook_definitions (enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_playbook_def_triggers_gin ON public.silvio_playbook_definitions USING gin (triggers);
CREATE INDEX IF NOT EXISTS idx_playbook_def_tags_gin ON public.silvio_playbook_definitions USING gin (tags);

-- RLS
ALTER TABLE public.silvio_playbook_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "playbook_def_read" ON public.silvio_playbook_definitions;
CREATE POLICY "playbook_def_read" ON public.silvio_playbook_definitions
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));

DROP POLICY IF EXISTS "playbook_def_super_admin" ON public.silvio_playbook_definitions;
CREATE POLICY "playbook_def_super_admin" ON public.silvio_playbook_definitions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC: match — trigger → playbook
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_playbook_match(
  p_trigger_type text,
  p_trigger_source_type text DEFAULT NULL,
  p_alert_type text DEFAULT NULL
)
RETURNS TABLE (
  id text, version text, category text, title text, description text,
  data_gathering jsonb, diagnosis_questions text[],
  options_template jsonb, anti_patterns jsonb, escalation jsonb,
  kpis_to_track jsonb, kb_context_areas text[],
  ai_prompt_template text, ai_router_task_key text, max_tokens_per_call int,
  is_critical boolean, tags text[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.version, p.category, p.title, p.description,
    p.data_gathering, p.diagnosis_questions,
    p.options_template, p.anti_patterns, p.escalation,
    p.kpis_to_track, p.kb_context_areas,
    p.ai_prompt_template, p.ai_router_task_key, p.max_tokens_per_call,
    p.is_critical, p.tags
  FROM public.silvio_playbook_definitions p
  WHERE p.enabled = true
    AND (
      -- match by alert_type quando presente
      (p_alert_type IS NOT NULL AND p.triggers @> jsonb_build_array(jsonb_build_object('type','alert','alert_type', p_alert_type)))
      OR
      -- match generico per trigger_type (+ source_type opzionale)
      (
        p.triggers @> jsonb_build_array(jsonb_build_object('type', p_trigger_type))
        AND (p_trigger_source_type IS NULL OR p.triggers @> jsonb_build_array(jsonb_build_object('type', p_trigger_type, 'source_type', p_trigger_source_type)))
      )
    )
  ORDER BY p.priority DESC, p.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_playbook_match(text, text, text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: list_active
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_playbook_list_active()
RETURNS TABLE (
  id text, version text, category text, title text,
  advisory_level int, enabled boolean,
  triggers_count int, options_count int, kpis_count int,
  last_updated timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, version, category, title,
    advisory_level, enabled,
    jsonb_array_length(triggers) AS triggers_count,
    jsonb_array_length(options_template) AS options_count,
    jsonb_array_length(kpis_to_track) AS kpis_count,
    updated_at AS last_updated
  FROM public.silvio_playbook_definitions
  ORDER BY category, priority DESC;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_playbook_list_active() TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: performance — stats su decisioni generate da un playbook
-- ───────────────────────────────────────────────────────────────────────────

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
    'avg_decision_time_hours', ROUND((AVG(EXTRACT(epoch FROM (decided_at - created_at))/3600.0))::numeric, 1)
  )
  FROM public.silvio_decision_log
  WHERE
    trigger_source_type = 'silvio_playbook_definitions'
    AND trigger_metadata->>'playbook_id' = p_playbook_id
    AND created_at >= now() - (p_days_back * interval '1 day');
$$;

GRANT EXECUTE ON FUNCTION public.silvio_playbook_performance(text, int) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) AI Router task playbook_advisor
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_router_config (
  task_key, task_label, task_description, primary_model, fallback_models,
  default_params, tier_key, category, enabled
) VALUES (
  'playbook_advisor',
  'Playbook Advisor AI',
  'Esegue playbook strutturati: combina dati Company Brain + KB + template, genera proposta SITUAZIONE/DIAGNOSI/OPZIONI/RACCOMANDAZIONE in JSON',
  'anthropic/claude-haiku-4.5',
  '["anthropic/claude-sonnet-4.5","openai/gpt-4o-mini"]'::jsonb,
  '{"temperature":0.2,"max_tokens":2000}'::jsonb,
  't3_balanced',
  'advisor',
  true
)
ON CONFLICT (task_key) DO UPDATE SET
  task_label = EXCLUDED.task_label,
  task_description = EXCLUDED.task_description,
  primary_model = EXCLUDED.primary_model,
  fallback_models = EXCLUDED.fallback_models,
  default_params = EXCLUDED.default_params;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Seed: playbook tensione-cassa-30gg (V1 core)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.silvio_playbook_definitions (
  id, version, category, advisory_level, title, description, enabled, priority,
  triggers, data_gathering, diagnosis_questions, options_template, anti_patterns,
  escalation, kpis_to_track, kb_context_areas,
  ai_prompt_template, ai_router_task_key, max_tokens_per_call,
  is_critical, tags, metadata
) VALUES (
  'tensione-cassa-30gg',
  '1.0',
  'cassa-finanza',
  3,
  'Tensione di cassa nelle prossime 4 settimane',
  'Playbook attivato quando la cassa proiettata a 30 giorni scende sotto soglia critica. Genera 4 opzioni standard di mitigazione con costi/rischi e suggerisce la mossa appropriata in base ai dati raccolti.',
  true,
  80,
  -- triggers
  '[
    {"type":"alert","source_type":"silvio_alerts","alert_type":"cashflow_critical_forecast"},
    {"type":"rpc_threshold","rpc":"silvio_cashflow_forecast_90d","condition":"critical_weeks_count > 0"},
    {"type":"user_request","keywords":["tensione cassa","non ho liquidita","problema di cassa","cassa breve"]}
  ]'::jsonb,
  -- data_gathering: chiama RPC reali esistenti
  '[
    {"step":"cashflow_90d","rpc":"silvio_cashflow_forecast_90d","params":{"p_weeks":13,"p_apply_delay":true}},
    {"step":"saldo_banche","rpc":"silvio_tool_cashflow_status","params":{"p_days_back":0}},
    {"step":"crediti_scaduti","rpc":"silvio_tool_overdue_payments","params":{}},
    {"step":"delay_pattern","rpc":"silvio_payment_delay_pattern","params":{}}
  ]'::jsonb,
  -- diagnosis_questions
  ARRAY[
    'La tensione e transitoria (1 mese) o strutturale (>3 mesi)?',
    'Ci sono clienti specifici in ritardo recuperabili?',
    'Quanto fido bancario residuo e disponibile?',
    'Ci sono fatture passive negoziabili in differimento?',
    'Il pattern di delay storico e migliorato o peggiorato?'
  ],
  -- options_template
  '[
    {"option_id":"A","title":"Anticipo SBF su fatture in scadenza","description":"Anticipo bancario sulle fatture emesse non ancora scadute. Cassa in 24-48h.","pros":["Veloce","Non richiede coinvolgimento clienti","Costo finanziario noto"],"cons":["Costo 6-8% annuo proporzionato","Limitato al fido SBF disponibile"],"cost_estimate_formula":"amount_anticipated * 0.06 * (days_to_collection / 365)","time_to_implement_days_min":1,"time_to_implement_days_max":3,"risk_level":"low","reversibility":"fully_reversible"},
    {"option_id":"B","title":"Sconto pagamento immediato a clienti scaduti","description":"Offerta sconto 2-3% per pagamento entro 7-15 giorni a clienti con saldi aperti.","pros":["Cassa rapida","Nessun costo finanziario","Non aumenta indebitamento"],"cons":["Sconto erode margine","Richiede negoziazione cliente per cliente"],"cost_estimate_formula":"amount_collected * 0.025","time_to_implement_days_min":7,"time_to_implement_days_max":15,"risk_level":"medium","reversibility":"fully_reversible"},
    {"option_id":"C","title":"Negoziazione differimento fornitori","description":"Richiesta proroga 30 giorni a fornitori storici per allungare DPO.","pros":["Nessun costo finanziario diretto"],"cons":["Rischio relazionale con fornitori","Solo con fornitori consolidati"],"cost_estimate_formula":"0 if successful else relationship_damage","time_to_implement_days_min":3,"time_to_implement_days_max":14,"risk_level":"medium","reversibility":"fully_reversible"},
    {"option_id":"D","title":"Aumento temporaneo fido bancario","description":"Richiesta aumento temporaneo del fido di cassa.","pros":["Cassa significativa","Non impatta clienti/fornitori"],"cons":["Tempi 5-15 giorni","Costo interessi maggiorato","Banca puo negare"],"cost_estimate_formula":"increase_amount * 0.07 * (days_used / 365)","time_to_implement_days_min":5,"time_to_implement_days_max":15,"risk_level":"low","reversibility":"fully_reversible"}
  ]'::jsonb,
  -- anti_patterns
  '[
    {"id":"lavoro_nero","description":"Ridurre costi tramite lavoro nero. RIFIUTO ASSOLUTO: rischio penale + sanzioni amministrative.","severity":"critical"},
    {"id":"fattura_anticipata_lavori_non_eseguiti","description":"Anticipare fatturazione di lavori non eseguiti. Problema fiscale e contabile.","severity":"critical"},
    {"id":"ingannare_clienti","description":"Comunicazioni ingannevoli ai clienti. Rischio reputazionale e legale.","severity":"critical"},
    {"id":"ritardare_versamenti_contributivi","description":"Saltare F24 INPS/Cassa Edile per fare cassa. Perdita DURC, sanzioni, blocco pagamenti.","severity":"high"}
  ]'::jsonb,
  -- escalation
  '{"decisor_role":"company_admin","consulta":["amministrazione"],"informa":["controller"],"external_pro_if":"tensione_strutturale_oltre_60gg","external_pro_who":"advisor_finanziario_o_commercialista"}'::jsonb,
  -- kpis_to_track
  '[
    {"kpi":"cassa_a_30gg_eur","rpc_query":"silvio_cashflow_forecast_90d.weeks[3].saldo_atteso_eur","baseline_capture":"at_proposal","checkpoint_days":[30,60,90],"target_direction":"increase"},
    {"kpi":"dso_medio","rpc_query":"silvio_payment_delay_pattern.avg_delay_days_global","baseline_capture":"at_proposal","checkpoint_days":[60,90],"target_direction":"decrease"}
  ]'::jsonb,
  -- kb_context_areas
  ARRAY['02-finanza-cashflow','11-advisor-strategico'],
  -- ai_prompt_template
  $tmpl$Sei in modalita Playbook "Tensione cassa 30gg". Combina i dati raccolti dal Company Brain con i principi del KB universale per generare una proposta strutturata.

DATI RACCOLTI (Company Brain):
{data_gathered}

CONTESTO KB UNIVERSALE (top match RAG):
{kb_context}

DOMANDE DI DIAGNOSI da ragionare:
{diagnosis_questions}

ANTI-PATTERN da NON suggerire MAI:
{anti_patterns}

ESCALATION suggerita:
{escalation}

OUTPUT richiesto: SOLO JSON (no markdown wrapper) con questo schema esatto:
{
  "situation": "string max 300 char — riassunto situazione attuale citando numeri specifici dai dati",
  "diagnosis": "string max 500 char — analisi tecnica: tensione transitoria/strutturale, cause principali",
  "options": [
    {
      "option_id": "A|B|C|D",
      "title": "string",
      "description": "string max 200 char (personalizza per situazione)",
      "applies": true,
      "calculated_cost_eur": number_or_null,
      "calculated_benefit_eur": number_or_null,
      "pros": ["string"],
      "cons": ["string"],
      "risk_level": "low|medium|high",
      "time_to_implement_days": number,
      "ai_assessment": "string max 200 char — perche e/non e adatta a QUESTO caso"
    }
  ],
  "recommended_option_id": "A|B|C|D|null",
  "confidence": "low|medium|high",
  "next_steps": ["max 3 azioni concrete"],
  "kpi_baseline": {"cassa_a_30gg_eur": number_or_null, "dso_medio": number_or_null}
}$tmpl$,
  'playbook_advisor',
  3500,  -- aumentato da 2000 a 3500 dopo test live (truncation a 4851 chars con 2k tokens)
  false,
  ARRAY['cassa','finanza','advisory-tattico'],
  '{"linked_kb_doc":"11-advisor-strategico/playbook-template.md","linked_principles":["02-finanza-cashflow/gestione-liquidita-cashflow.md"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  version = EXCLUDED.version,
  triggers = EXCLUDED.triggers,
  data_gathering = EXCLUDED.data_gathering,
  diagnosis_questions = EXCLUDED.diagnosis_questions,
  options_template = EXCLUDED.options_template,
  anti_patterns = EXCLUDED.anti_patterns,
  escalation = EXCLUDED.escalation,
  kpis_to_track = EXCLUDED.kpis_to_track,
  kb_context_areas = EXCLUDED.kb_context_areas,
  ai_prompt_template = EXCLUDED.ai_prompt_template,
  updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Verifiche post-migration
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cnt int; v_match record;
BEGIN
  -- Tabella e seed
  SELECT count(*) INTO v_cnt FROM public.silvio_playbook_definitions WHERE id='tensione-cassa-30gg';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'Seed playbook non inserito'; END IF;
  RAISE NOTICE 'OK: seed playbook tensione-cassa-30gg presente';

  -- RPC match per alert
  SELECT id INTO v_match FROM public.silvio_playbook_match('alert', 'silvio_alerts', 'cashflow_critical_forecast');
  IF v_match.id IS DISTINCT FROM 'tensione-cassa-30gg' THEN
    RAISE EXCEPTION 'RPC match non ritorna playbook atteso, ricevuto: %', v_match.id;
  END IF;
  RAISE NOTICE 'OK: silvio_playbook_match funziona per alert cashflow_critical_forecast';

  -- AI Router task
  SELECT count(*) INTO v_cnt FROM public.ai_router_config WHERE task_key='playbook_advisor';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'AI Router task playbook_advisor non configurato'; END IF;
  RAISE NOTICE 'OK: AI Router playbook_advisor configurato';
END $$;

COMMIT;
