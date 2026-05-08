-- ════════════════════════════════════════════════════════════════════════════
-- AI TEST LAB — Tracking granulare modelli per Demo Azienda S.r.l.
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge l'infrastruttura "AI Test Lab" gating-protetta a Demo Azienda:
--
--   1. ai_test_runs: una riga per ogni chiamata AI (chat, agents, tools) della
--      demo company. Costo arriva direttamente da OpenRouter (usage.cost),
--      latenza misurata client-side dall'aiRouter.
--
--   2. ai_demo_default_models: preferenze per task_key — quando un cron/trigger
--      invoca aiRouterComplete senza forceModel esplicito, se la company è
--      demo, usa questo override invece del primary_model di ai_router_config.
--
-- Tutto gated a:
--   DEMO_COMPANY_ID = '778a2c76-1253-49f2-a5e8-283363ac3e29'
--   DEMO_USER_EMAIL = 'demo@azienda.srl'
--
-- Le aziende reali NON sono toccate: aiRouter.ts continua a usare
-- ai_router_config.primary_model come prima.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Tabella ai_test_runs — tracking granulare ───────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Quale entry point AI ha originato la chiamata
  feature text NOT NULL,                    -- 'silvio_chat', 'ai_orchestrator', 'ai_council', 'silvio_execute', ...
  task_key text,                             -- task_key di ai_router_config (es. 'persona_silvio')
  persona_key text,                          -- persona AI che ha generato (es. 'silvio', 'cfo')

  -- Modello effettivamente usato
  model_id text NOT NULL,                    -- 'moonshotai/kimi-k2', 'anthropic/claude-sonnet-4.5', ...
  provider text NOT NULL,                    -- 'moonshotai', 'anthropic', 'openai', 'google', ...
  forced_by_user boolean DEFAULT false,      -- true se l'utente demo ha scelto manualmente il modello

  -- Performance
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0, -- da OpenRouter usage.cost
  latency_ms int,

  -- Audit / debug
  openrouter_generation_id text,
  prompt_excerpt text,                       -- primi 300 char del prompt (solo demo, no GDPR issue)
  response_excerpt text,                     -- primi 300 char della risposta
  error text,                                -- nullable, popolato se la chiamata è fallita

  -- Future V2: rating utente (👍/👎/⭐ 1-5)
  user_rating smallint CHECK (user_rating IS NULL OR user_rating BETWEEN 1 AND 5),
  rating_notes text
);

-- Indici per la dashboard AI Test Lab
CREATE INDEX IF NOT EXISTS idx_ai_test_runs_company_feature_created
  ON public.ai_test_runs (company_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_test_runs_model_created
  ON public.ai_test_runs (model_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_test_runs_user_created
  ON public.ai_test_runs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- RLS: solo Demo Azienda può leggere/scrivere
ALTER TABLE public.ai_test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_test_runs_demo_select ON public.ai_test_runs;
CREATE POLICY ai_test_runs_demo_select ON public.ai_test_runs
  FOR SELECT
  TO authenticated
  USING (
    company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_id
    )
  );

-- Solo service_role può INSERT (lo fa aiRouter.ts via supabaseAdmin)
GRANT SELECT ON public.ai_test_runs TO authenticated;
GRANT SELECT, INSERT ON public.ai_test_runs TO service_role;

COMMENT ON TABLE public.ai_test_runs IS
  'AI Test Lab — tracking granulare di OGNI chiamata AI passante per OpenRouter, GATED a Demo Azienda S.r.l. Popolata da aiRouter.ts shared lib.';

-- ─── 2) Tabella ai_demo_default_models — preferenze per task_key ────────────
-- Quando l'utente demo seleziona "Imposta come default per silvio_chat" nella
-- dashboard AI Test Lab, il modello scelto va qui. Le chiamate background
-- (cron, trigger DB) leggeranno questo override automaticamente.
CREATE TABLE IF NOT EXISTS public.ai_demo_default_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_key text NOT NULL,                    -- es. 'persona_silvio', 'council_synthesis', 'doc_router'
  model_id text NOT NULL,                    -- es. 'moonshotai/kimi-k2'
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (company_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_demo_default_models_lookup
  ON public.ai_demo_default_models (company_id, task_key);

ALTER TABLE public.ai_demo_default_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_demo_default_models_demo_all ON public.ai_demo_default_models;
CREATE POLICY ai_demo_default_models_demo_all ON public.ai_demo_default_models
  FOR ALL
  TO authenticated
  USING (
    company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_id
    )
  )
  WITH CHECK (
    company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_demo_default_models TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_demo_default_models TO service_role;

COMMENT ON TABLE public.ai_demo_default_models IS
  'AI Test Lab — preferenze modello per task_key, GATED a Demo Azienda. Override del primary_model di ai_router_config.';

-- ─── 3) Quota giornaliera anti bill-shock (rate limit) ───────────────────────
-- Limite hard di 200 chiamate/giorno per la demo company per evitare costi
-- accidentali se la chiave OpenRouter viene esposta o un loop infinito gira.
-- Valore configurabile via UPDATE manuale.
CREATE TABLE IF NOT EXISTS public.ai_test_quota (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  daily_calls_cap int NOT NULL DEFAULT 200,
  monthly_cost_cap_usd numeric(8, 2) NOT NULL DEFAULT 50.00,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_test_quota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_test_quota_demo_read ON public.ai_test_quota;
CREATE POLICY ai_test_quota_demo_read ON public.ai_test_quota
  FOR SELECT
  TO authenticated
  USING (company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid);

GRANT SELECT ON public.ai_test_quota TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_test_quota TO service_role;

-- Seed default quota per Demo Azienda
INSERT INTO public.ai_test_quota (company_id, daily_calls_cap, monthly_cost_cap_usd, notes)
VALUES (
  '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid,
  200,
  50.00,
  'AI Test Lab — quota di sicurezza giornaliera/mensile'
)
ON CONFLICT (company_id) DO NOTHING;

COMMENT ON TABLE public.ai_test_quota IS
  'AI Test Lab — quota giornaliera + cap mensile per evitare bill-shock. Demo only.';

-- ─── 4) RPC helper: KPI aggregati per la dashboard ──────────────────────────
CREATE OR REPLACE FUNCTION public.ai_test_lab_kpi(
  p_company_id uuid,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to   timestamptz DEFAULT now()
) RETURNS TABLE (
  feature text,
  model_id text,
  provider text,
  total_calls bigint,
  avg_cost_usd numeric,
  total_cost_usd numeric,
  avg_latency_ms numeric,
  p50_latency_ms numeric,
  p95_latency_ms numeric,
  avg_input_tokens numeric,
  avg_output_tokens numeric,
  avg_rating numeric,
  ratings_count bigint,
  errors_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    feature,
    model_id,
    provider,
    count(*)::bigint AS total_calls,
    ROUND(avg(cost_usd)::numeric, 6) AS avg_cost_usd,
    ROUND(sum(cost_usd)::numeric, 4) AS total_cost_usd,
    ROUND(avg(latency_ms)::numeric, 0) AS avg_latency_ms,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
    ROUND(avg(input_tokens)::numeric, 0) AS avg_input_tokens,
    ROUND(avg(output_tokens)::numeric, 0) AS avg_output_tokens,
    ROUND(avg(user_rating)::numeric, 2) AS avg_rating,
    count(*) FILTER (WHERE user_rating IS NOT NULL)::bigint AS ratings_count,
    count(*) FILTER (WHERE error IS NOT NULL)::bigint AS errors_count
  FROM public.ai_test_runs
  WHERE company_id = p_company_id
    AND created_at >= p_from
    AND created_at <= p_to
  GROUP BY feature, model_id, provider
  ORDER BY total_calls DESC, total_cost_usd DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ai_test_lab_kpi(uuid, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.ai_test_lab_kpi IS
  'AI Test Lab — KPI aggregati per dashboard (costi, latency p50/p95, rating, errori).';
