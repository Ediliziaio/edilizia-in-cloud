-- MP-AIR-01 — AI Router via OpenRouter
--
-- OpenRouter (https://openrouter.ai) e' un proxy unificato verso 200+ modelli
-- AI (Anthropic, OpenAI, Google, Meta, Mistral, DeepSeek, ecc.) accessibile
-- con UNA sola API key. Permette di:
--   • scegliere il modello PIU' ECONOMICO adatto a ogni task specifico
--   • avere fallback automatico se un provider va giu'
--   • tracciare costi per task in modo granulare
--   • cambiare modello senza redeployare edge functions
--
-- Architettura:
--   1. ai_router_config: per ogni "task_key" (es. listino_extract, preventivo_genera)
--      configura primary_model + fallback_chain + parametri (temperature, max_tokens)
--   2. ai_router_usage_log: log per ogni chiamata (task, modello vincente, tokens, costo)
--   3. platform_settings.openrouter_api_key: la chiave API (encrypted via vault)
--
-- Default: 13 task pre-configurati con modelli cost-optimized.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Tabella ai_router_config — mapping task → modello
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_router_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key        text NOT NULL UNIQUE,
  task_label      text NOT NULL,
  task_description text,
  /** Modello primario formato OpenRouter: "provider/model-id" */
  primary_model   text NOT NULL,
  /** Catena fallback: array di modelli da provare se primary fallisce */
  fallback_models jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Parametri default (temperature, max_tokens, top_p, ecc.) */
  default_params  jsonb NOT NULL DEFAULT '{}'::jsonb,
  /** Categoria per UI: extraction, generation, analysis, classification, vision */
  category        text NOT NULL DEFAULT 'generation',
  /** Stima costo $/1M token (input avg + output avg) per UI */
  estimated_cost_per_million numeric(8,4),
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_router_config_task ON public.ai_router_config(task_key) WHERE enabled = true;

ALTER TABLE public.ai_router_config ENABLE ROW LEVEL SECURITY;

-- Solo super_admin puo' leggere/modificare la config router
DROP POLICY IF EXISTS ai_router_config_admin_select ON public.ai_router_config;
CREATE POLICY ai_router_config_admin_select ON public.ai_router_config FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS ai_router_config_admin_modify ON public.ai_router_config;
CREATE POLICY ai_router_config_admin_modify ON public.ai_router_config FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_ai_router_config_updated_at ON public.ai_router_config;
CREATE TRIGGER trg_ai_router_config_updated_at
  BEFORE UPDATE ON public.ai_router_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ai_router_config IS
  'Config AI router: mapping task → modello OpenRouter (primary + fallback chain).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Tabella ai_router_usage_log — log uso per analitiche costi/risparmi
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_router_usage_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key        text NOT NULL,
  /** Modello effettivamente usato (puo' essere fallback). */
  model_used      text NOT NULL,
  /** True se ha usato il primary, false se ha usato un fallback. */
  used_primary    boolean NOT NULL DEFAULT true,
  /** Quale fallback ha funzionato (0 = primary, 1 = primo fallback, ecc.) */
  fallback_index  int NOT NULL DEFAULT 0,
  prompt_tokens   int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  total_tokens    int NOT NULL DEFAULT 0,
  /** Costo stimato in USD (calcolato da OpenRouter response) */
  cost_usd        numeric(10,6) NOT NULL DEFAULT 0,
  /** Latenza ms */
  duration_ms     int,
  /** Per attribuzione: company_id (opzionale, alcuni task non hanno tenant) */
  company_id      uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  /** Outcome: success | error | timeout */
  status          text NOT NULL DEFAULT 'success',
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_router_log_task_date
  ON public.ai_router_usage_log(task_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_router_log_company
  ON public.ai_router_usage_log(company_id, created_at DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_router_log_status
  ON public.ai_router_usage_log(status, created_at DESC) WHERE status <> 'success';

ALTER TABLE public.ai_router_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_router_log_admin ON public.ai_router_usage_log;
CREATE POLICY ai_router_log_admin ON public.ai_router_usage_log FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS ai_router_log_company_select ON public.ai_router_usage_log;
CREATE POLICY ai_router_log_company_select ON public.ai_router_usage_log FOR SELECT
  USING (company_id = public.get_my_company_id());

COMMENT ON TABLE public.ai_router_usage_log IS
  'Log uso AI router: per ogni chiamata, modello vincente + token + costo USD.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Seed dei task pre-configurati (cost-optimized)
-- ════════════════════════════════════════════════════════════════════════════
-- Strategia: usare il modello PIU' ECONOMICO che mantiene qualita' accettabile.
-- DeepSeek V3.1 e' eccellente per estrazione/categorizzazione a $0.27/1M.
-- Llama 3.3 per classificazione semplice.
-- Claude Haiku 4.5 per generazione bilanciata qualita'/costo.
-- Claude Sonnet 4.5 SOLO per task complessi che richiedono ragionamento.
-- openrouter/auto come fallback default (sceglie automaticamente il migliore).

INSERT INTO public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models, category, estimated_cost_per_million, default_params)
VALUES
  -- Estrazione strutturata da documenti (listini, fatture, anagrafiche)
  ('listino_extract', 'Estrazione listino prezzi', 'OCR/parse PDF listini fornitori in JSON',
   'deepseek/deepseek-chat-v3.1',
   '["openai/gpt-4o-mini", "anthropic/claude-haiku-4.5"]'::jsonb,
   'extraction', 0.27,
   '{"temperature": 0.1, "max_tokens": 4000}'::jsonb),

  ('customers_extract', 'Estrazione anagrafiche clienti', 'Parse CSV/Excel anagrafiche clienti',
   'deepseek/deepseek-chat-v3.1',
   '["openai/gpt-4o-mini"]'::jsonb,
   'extraction', 0.27,
   '{"temperature": 0.1, "max_tokens": 4000}'::jsonb),

  ('tabella_finanziamento_extract', 'Estrazione tabelle finanziamento', 'Parse PDF tabelle Fiditalia/Compass',
   'deepseek/deepseek-chat-v3.1',
   '["openai/gpt-4o-mini"]'::jsonb,
   'extraction', 0.27,
   '{"temperature": 0.0, "max_tokens": 8000}'::jsonb),

  ('computo_extract', 'Estrazione computo metrico', 'Parse PDF computo metrico estimativo',
   'openai/gpt-4o-mini',
   '["anthropic/claude-haiku-4.5"]'::jsonb,
   'extraction', 0.60,
   '{"temperature": 0.1, "max_tokens": 8000}'::jsonb),

  ('rapportino_parse', 'Parse rapportino cantiere', 'Estrai ore/attivita da testo libero',
   'deepseek/deepseek-chat-v3.1',
   '["openai/gpt-4o-mini"]'::jsonb,
   'extraction', 0.27,
   '{"temperature": 0.2, "max_tokens": 2000}'::jsonb),

  -- Categorizzazione (task semplici)
  ('bank_categorize', 'Categorizzazione movimenti bancari', 'Assegna categoria a transazione',
   'meta-llama/llama-3.3-70b-instruct',
   '["openai/gpt-4o-mini", "deepseek/deepseek-chat-v3.1"]'::jsonb,
   'classification', 0.38,
   '{"temperature": 0.1, "max_tokens": 200}'::jsonb),

  -- Generazione testi commerciali
  ('preventivo_genera', 'Generazione preventivo da brief', 'Crea testo preventivo da descrizione cliente',
   'anthropic/claude-haiku-4.5',
   '["openai/gpt-4o-mini"]'::jsonb,
   'generation', 1.00,
   '{"temperature": 0.5, "max_tokens": 4000}'::jsonb),

  ('email_compose', 'Generazione email marketing', 'Crea testo email da brief',
   'anthropic/claude-haiku-4.5',
   '["openai/gpt-4o-mini"]'::jsonb,
   'generation', 1.00,
   '{"temperature": 0.7, "max_tokens": 1500}'::jsonb),

  -- Analisi semantica
  ('preventivo_analisi', 'Analisi semantica preventivi', 'Identifica pattern, anomalie, suggerimenti',
   'anthropic/claude-haiku-4.5',
   '["openai/gpt-4o-mini"]'::jsonb,
   'analysis', 1.00,
   '{"temperature": 0.3, "max_tokens": 2000}'::jsonb),

  ('lead_qualify', 'Qualifica lead in entrata', 'Estrai info + scoring da messaggi cliente',
   'deepseek/deepseek-chat-v3.1',
   '["openai/gpt-4o-mini", "anthropic/claude-haiku-4.5"]'::jsonb,
   'classification', 0.27,
   '{"temperature": 0.2, "max_tokens": 1500}'::jsonb),

  -- Task complessi che richiedono ragionamento + tool use
  ('agent_complex', 'Agente AI complesso (tool use)', 'Conversazione con strumenti CRM/cantieri',
   'anthropic/claude-sonnet-4.5',
   '["openai/gpt-4o", "anthropic/claude-haiku-4.5"]'::jsonb,
   'analysis', 3.00,
   '{"temperature": 0.4, "max_tokens": 4000}'::jsonb),

  ('contratto_review', 'Revisione contratti/preventivi premium', 'Analisi giuridica/commerciale documenti',
   'anthropic/claude-sonnet-4.5',
   '["openai/gpt-4o"]'::jsonb,
   'analysis', 3.00,
   '{"temperature": 0.2, "max_tokens": 8000}'::jsonb),

  -- Vision (immagini cantiere, foto rapportini, render)
  ('vision_cantiere', 'Vision: foto cantiere/lavori', 'Analizza foto avanzamento + sicurezza',
   'openai/gpt-4o-mini',
   '["anthropic/claude-haiku-4.5"]'::jsonb,
   'analysis', 0.60,
   '{"temperature": 0.3, "max_tokens": 1500}'::jsonb)

ON CONFLICT (task_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) RPC helper: legge config per task con fallback default
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_ai_router_config(p_task_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config record;
BEGIN
  SELECT * INTO v_config
  FROM public.ai_router_config
  WHERE task_key = p_task_key AND enabled = true;

  IF NOT FOUND THEN
    -- Default sicuro se task non configurato: cheap model + auto fallback
    RETURN jsonb_build_object(
      'task_key', p_task_key,
      'primary_model', 'openai/gpt-4o-mini',
      'fallback_models', '["openrouter/auto"]'::jsonb,
      'default_params', '{"temperature": 0.3, "max_tokens": 2000}'::jsonb,
      'is_default', true
    );
  END IF;

  RETURN jsonb_build_object(
    'task_key', v_config.task_key,
    'task_label', v_config.task_label,
    'primary_model', v_config.primary_model,
    'fallback_models', v_config.fallback_models,
    'default_params', v_config.default_params,
    'category', v_config.category,
    'estimated_cost_per_million', v_config.estimated_cost_per_million,
    'is_default', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_router_config FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_router_config TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ai_router_config IS
  'Ritorna config router per un task_key. Fallback safe se non configurato.';
