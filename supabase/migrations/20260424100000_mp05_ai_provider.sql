-- MP05 — AI Provider abstraction (OpenRouter)
-- Tabelle: ai_model_catalog + ai_model_config + ai_model_usage_log + RLS.
-- Adattato a schema reale: RLS via profiles.company_id + user_roles (no user_company_roles).
-- Owner: Florin Andriciuc | Data: 2026-04-24

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Catalogo modelli (popolato da cron sync-openrouter-catalog)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_model_catalog (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id                TEXT NOT NULL UNIQUE,
  provider                TEXT NOT NULL,
  display_name            TEXT,
  context_length          INT,
  pricing_input_usd_1m    NUMERIC(10,4),
  pricing_output_usd_1m   NUMERIC(10,4),
  supports_tools          BOOLEAN DEFAULT false,
  supports_vision         BOOLEAN DEFAULT false,
  supports_json_mode      BOOLEAN DEFAULT false,
  supports_streaming      BOOLEAN DEFAULT true,
  status                  TEXT DEFAULT 'active'
    CHECK (status IN ('active','deprecated','unavailable')),
  whitelisted             BOOLEAN DEFAULT false,
  added_at                TIMESTAMPTZ DEFAULT now(),
  last_synced_at          TIMESTAMPTZ DEFAULT now(),
  notes                   TEXT
);

CREATE INDEX IF NOT EXISTS ix_ai_model_catalog_status_wl
  ON public.ai_model_catalog(status, whitelisted)
  WHERE status = 'active';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Configurazione per-company: quale modello per quale task
-- company_id NULL = config globale piattaforma AEDIX (fallback default)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_model_config (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  task_kind              TEXT NOT NULL CHECK (task_kind IN (
    'bot_operativo_titolare','bot_operativo_operaio',
    'assistenza_clienti','lead_qualificazione',
    'vision_ddt','vision_cantiere','parse_rapportino',
    'computo_metrico','bank_categorize','chat_routine',
    'default'
  )),
  primary_model          TEXT NOT NULL,
  fallback_chain         JSONB DEFAULT '[]'::jsonb,
  max_cost_usd_per_call  NUMERIC(10,5) DEFAULT 0.50,
  temperature            NUMERIC(3,2) DEFAULT 0.5,
  max_tokens             INT DEFAULT 800,
  enabled                BOOLEAN DEFAULT true,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, task_kind)
);

-- Unique partial index per config globale (company_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_model_config_global_task
  ON public.ai_model_config(task_kind)
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_ai_model_config_company
  ON public.ai_model_config(company_id, task_kind)
  WHERE enabled = true;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Log di utilizzo — 1 riga per chiamata AI (successo o fallimento)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_model_usage_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts                TIMESTAMPTZ DEFAULT now(),
  company_id        UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  task_kind         TEXT NOT NULL,
  model_requested   TEXT NOT NULL,
  model_used        TEXT NOT NULL,
  provider_used     TEXT,
  fallback_hops     INT DEFAULT 0,
  tokens_prompt     INT,
  tokens_completion INT,
  tokens_total      INT,
  cost_usd          NUMERIC(10,6),
  latency_ms        INT,
  ok                BOOLEAN,
  error_code        TEXT,
  error_detail      TEXT,
  wa_message_id     UUID,
  metadata          JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_ai_usage_log_ts
  ON public.ai_model_usage_log(ts DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_log_company_ts
  ON public.ai_model_usage_log(company_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_log_model
  ON public.ai_model_usage_log(model_used, ts DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_log_errors
  ON public.ai_model_usage_log(ts DESC)
  WHERE ok = false;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RLS (adattato: profiles.company_id + user_roles, no user_company_roles)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_read_all" ON public.ai_model_catalog;
CREATE POLICY "catalog_read_all" ON public.ai_model_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "catalog_admin_write" ON public.ai_model_catalog;
CREATE POLICY "catalog_admin_write" ON public.ai_model_catalog
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "catalog_service_all" ON public.ai_model_catalog;
CREATE POLICY "catalog_service_all" ON public.ai_model_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "config_company_read" ON public.ai_model_config;
CREATE POLICY "config_company_read" ON public.ai_model_config
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "config_company_write" ON public.ai_model_config;
CREATE POLICY "config_company_write" ON public.ai_model_config
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "config_service_all" ON public.ai_model_config;
CREATE POLICY "config_service_all" ON public.ai_model_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "usage_company_read" ON public.ai_model_usage_log;
CREATE POLICY "usage_company_read" ON public.ai_model_usage_log
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "usage_service_all" ON public.ai_model_usage_log;
CREATE POLICY "usage_service_all" ON public.ai_model_usage_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Trigger updated_at
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ai_model_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_model_config_updated_at ON public.ai_model_config;
CREATE TRIGGER trg_ai_model_config_updated_at
  BEFORE UPDATE ON public.ai_model_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_ai_model_config_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Seed iniziale catalogo modelli + config default globali
-- (prezzi indicativi — cron sync-openrouter-catalog sovrascrive ogni 24h)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_model_catalog (
  model_id, provider, display_name,
  context_length, pricing_input_usd_1m, pricing_output_usd_1m,
  supports_tools, supports_vision, supports_json_mode, whitelisted
) VALUES
  ('anthropic/claude-sonnet-4','anthropic','Claude Sonnet 4',
    200000, 3.00, 15.00, true, true, true, true),
  ('anthropic/claude-haiku-4','anthropic','Claude Haiku 4',
    200000, 0.80, 4.00, true, true, true, true),
  ('openai/gpt-4o','openai','GPT-4o',
    128000, 2.50, 10.00, true, true, true, true),
  ('openai/gpt-4o-mini','openai','GPT-4o Mini',
    128000, 0.15, 0.60, true, true, true, true),
  ('moonshot/kimi-k2','moonshot','Kimi K2',
    200000, 0.25, 1.00, true, false, true, true),
  ('deepseek/deepseek-v3','deepseek','DeepSeek V3',
    64000, 0.30, 1.20, true, false, true, true),
  ('google/gemini-flash-2.5','google','Gemini Flash 2.5',
    1000000, 0.10, 0.40, true, true, true, true),
  ('openrouter/auto','openrouter','OpenRouter Auto (router)',
    128000, 1.50, 6.00, false, false, false, true)
ON CONFLICT (model_id) DO NOTHING;

INSERT INTO public.ai_model_config (
  company_id, task_kind, primary_model, fallback_chain,
  max_cost_usd_per_call, temperature, max_tokens
) VALUES
  (NULL, 'bot_operativo_titolare', 'anthropic/claude-sonnet-4',
    '["openai/gpt-4o","moonshot/kimi-k2"]'::jsonb, 0.50, 0.5, 1000),
  (NULL, 'bot_operativo_operaio', 'deepseek/deepseek-v3',
    '["anthropic/claude-haiku-4","openai/gpt-4o-mini"]'::jsonb, 0.20, 0.5, 800),
  (NULL, 'assistenza_clienti', 'anthropic/claude-haiku-4',
    '["openai/gpt-4o-mini","deepseek/deepseek-v3"]'::jsonb, 0.20, 0.6, 800),
  (NULL, 'lead_qualificazione', 'anthropic/claude-sonnet-4',
    '["openai/gpt-4o","deepseek/deepseek-v3"]'::jsonb, 0.40, 0.6, 800),
  (NULL, 'vision_ddt', 'openai/gpt-4o',
    '["google/gemini-flash-2.5","anthropic/claude-sonnet-4"]'::jsonb, 0.30, 0.2, 1500),
  (NULL, 'vision_cantiere', 'google/gemini-flash-2.5',
    '["openai/gpt-4o-mini"]'::jsonb, 0.15, 0.3, 500),
  (NULL, 'parse_rapportino', 'openai/gpt-4o-mini',
    '["anthropic/claude-haiku-4","deepseek/deepseek-v3"]'::jsonb, 0.10, 0.2, 600),
  (NULL, 'computo_metrico', 'anthropic/claude-sonnet-4',
    '["openai/gpt-4o"]'::jsonb, 0.80, 0.3, 2000),
  (NULL, 'bank_categorize', 'moonshot/kimi-k2',
    '["openai/gpt-4o-mini"]'::jsonb, 0.05, 0.2, 300),
  (NULL, 'chat_routine', 'openrouter/auto',
    '["anthropic/claude-haiku-4"]'::jsonb, 0.15, 0.7, 600),
  (NULL, 'default', 'openai/gpt-4o-mini',
    '["anthropic/claude-haiku-4"]'::jsonb, 0.20, 0.5, 800)
ON CONFLICT (task_kind) WHERE company_id IS NULL DO NOTHING;

COMMENT ON TABLE public.ai_model_catalog IS
  'MP05 — Catalogo modelli AI via OpenRouter. Popolato da cron sync-openrouter-catalog (24h).';
COMMENT ON TABLE public.ai_model_config IS
  'MP05 — Config per-company e globale (company_id=NULL) per task_kind → primary+fallback chain.';
COMMENT ON TABLE public.ai_model_usage_log IS
  'MP05 — Audit log: 1 riga per chiamata AI con costo, latency, fallback_hops.';

COMMIT;
