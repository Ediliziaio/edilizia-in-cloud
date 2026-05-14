-- =============================================================================
-- Render AI provider unified — step 1 (infissi)
--
-- Scopo:
-- - aggiunge i task_kind render al provider AI globale;
-- - registra modelli/costi per OpenRouter Nano Banana + fallback OpenAI;
-- - aggiunge idempotency e audit prompt alle sessioni render.
--
-- Nota operativa:
-- questa migration NON cambia il default dei vecchi provider render, cosi'
-- gli altri verticali non ancora migrati continuano a usare il flusso storico.
-- =============================================================================

BEGIN;

-- 1) Allarga i CHECK task_kind per i task render.
ALTER TABLE public.ai_model_config
  DROP CONSTRAINT IF EXISTS ai_model_config_task_kind_check;

ALTER TABLE public.ai_model_config
  ADD CONSTRAINT ai_model_config_task_kind_check
  CHECK (task_kind IN (
    'bot_operativo_titolare',
    'bot_operativo_operaio',
    'assistenza_clienti',
    'lead_qualificazione',
    'vision_ddt',
    'vision_cantiere',
    'parse_rapportino',
    'computo_metrico',
    'bank_categorize',
    'chat_routine',
    'render_image_edit',
    'render_scene_analysis',
    'render_image_qa',
    'default'
  ));

ALTER TABLE public.ai_pricing_markup
  DROP CONSTRAINT IF EXISTS ai_pricing_markup_task_kind_check;

ALTER TABLE public.ai_pricing_markup
  ADD CONSTRAINT ai_pricing_markup_task_kind_check
  CHECK (task_kind IN (
    'bot_operativo_titolare',
    'bot_operativo_operaio',
    'assistenza_clienti',
    'lead_qualificazione',
    'vision_ddt',
    'vision_cantiere',
    'parse_rapportino',
    'computo_metrico',
    'bank_categorize',
    'chat_routine',
    'render_image_edit',
    'render_scene_analysis',
    'render_image_qa',
    'default'
  ));

-- 2) Config AI globale per i task render.
INSERT INTO public.ai_model_config (
  task_kind,
  company_id,
  primary_model,
  fallback_chain,
  max_cost_usd_per_call,
  temperature,
  max_tokens,
  enabled
)
VALUES
  (
    'render_image_edit',
    NULL,
    'google/gemini-2.5-flash-image',
    '["openai/gpt-image-1.5","openai/gpt-image-1"]'::jsonb,
    0.30,
    0.4,
    1500,
    true
  ),
  (
    'render_scene_analysis',
    NULL,
    'google/gemini-2.5-flash',
    '["anthropic/claude-haiku-4.5","openai/gpt-4o-mini"]'::jsonb,
    0.05,
    0.1,
    4096,
    true
  ),
  (
    'render_image_qa',
    NULL,
    'google/gemini-2.5-flash',
    '["anthropic/claude-haiku-4.5","openai/gpt-4o-mini"]'::jsonb,
    0.03,
    0.0,
    800,
    true
  )
ON CONFLICT (task_kind) DO UPDATE SET
  primary_model = EXCLUDED.primary_model,
  fallback_chain = EXCLUDED.fallback_chain,
  max_cost_usd_per_call = EXCLUDED.max_cost_usd_per_call,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  enabled = true,
  updated_at = now();

-- 2b) Bonifica config OpenRouter legacy: alcuni ID 2026 non esistono piu'
-- nel catalogo OpenRouter e causano fallback morti o tentativi inutili.
UPDATE public.ai_model_config
SET
  primary_model = CASE primary_model
    WHEN 'anthropic/claude-haiku-4' THEN 'anthropic/claude-haiku-4.5'
    WHEN 'moonshot/kimi-k2' THEN 'moonshotai/kimi-k2.5'
    WHEN 'deepseek/deepseek-v3' THEN 'deepseek/deepseek-chat-v3.1'
    WHEN 'google/gemini-flash-2.5' THEN 'google/gemini-2.5-flash'
    WHEN 'google/gemini-pro-2.5' THEN 'google/gemini-2.5-pro'
    ELSE primary_model
  END,
  fallback_chain = CASE
    WHEN fallback_chain IS NULL THEN fallback_chain
    ELSE replace(
      replace(
        replace(
          replace(
            replace(
              fallback_chain::text,
              '"anthropic/claude-haiku-4"',
              '"anthropic/claude-haiku-4.5"'
            ),
            '"moonshot/kimi-k2"',
            '"moonshotai/kimi-k2.5"'
          ),
          '"deepseek/deepseek-v3"',
          '"deepseek/deepseek-chat-v3.1"'
        ),
        '"google/gemini-flash-2.5"',
        '"google/gemini-2.5-flash"'
      ),
      '"google/gemini-pro-2.5"',
      '"google/gemini-2.5-pro"'
    )::jsonb
  END,
  updated_at = now()
WHERE primary_model IN (
    'anthropic/claude-haiku-4',
    'moonshot/kimi-k2',
    'deepseek/deepseek-v3',
    'google/gemini-flash-2.5',
    'google/gemini-pro-2.5'
  )
  OR fallback_chain::text ~
    '(anthropic/claude-haiku-4"|moonshot/kimi-k2"|deepseek/deepseek-v3"|google/gemini-flash-2.5"|google/gemini-pro-2.5")';

-- 3) Markup per i task render (catch-all, non per modello).
INSERT INTO public.ai_pricing_markup (
  task_kind,
  model_pattern,
  markup_multiplier,
  display_label,
  description,
  enabled
)
VALUES
  (
    'render_image_edit',
    NULL,
    4.00,
    'Render AI fotorealistico',
    'Generazione/edit immagine fotorealistico per preventivi e prima/dopo.',
    true
  ),
  (
    'render_scene_analysis',
    NULL,
    2.50,
    'Analisi scena render',
    'Analisi vision pre-render: aperture, ambiente, accessori e vincoli.',
    true
  ),
  (
    'render_image_qa',
    NULL,
    2.00,
    'QA visuale render',
    'Controllo visuale post-render prima di salvare il risultato.',
    true
  )
ON CONFLICT (task_kind) WHERE model_pattern IS NULL DO UPDATE SET
  markup_multiplier = EXCLUDED.markup_multiplier,
  display_label = EXCLUDED.display_label,
  description = EXCLUDED.description,
  enabled = true,
  updated_at = now();

-- 4) Catalogo modelli compatibile con lo schema attuale.
INSERT INTO public.ai_model_catalog (
  model_id,
  provider,
  display_name,
  pricing_input_usd_1m,
  pricing_output_usd_1m,
  supports_vision,
  supports_json_mode,
  status,
  whitelisted,
  notes
)
VALUES
  (
    'google/gemini-2.5-flash-image',
    'google',
    'Gemini 2.5 Flash Image (Nano Banana)',
    NULL,
    NULL,
    true,
    false,
    'active',
    true,
    'Provider primario Render AI via OpenRouter. Costo immagine tracciato in render_provider_pricing.'
  ),
  (
    'openai/gpt-image-1.5',
    'openai',
    'OpenAI GPT Image 1.5',
    NULL,
    NULL,
    false,
    false,
    'active',
    true,
    'Fallback diretto per image edit render.'
  ),
  (
    'openai/gpt-image-1',
    'openai',
    'OpenAI GPT Image 1',
    NULL,
    NULL,
    false,
    false,
    'active',
    true,
    'Ultimo fallback diretto per image edit render.'
  ),
  (
    'google/gemini-2.5-flash',
    'google',
    'Gemini 2.5 Flash',
    0.30,
    2.50,
    true,
    true,
    'active',
    true,
    'Vision JSON per analisi scena e QA render.'
  ),
  (
    'anthropic/claude-haiku-4.5',
    'anthropic',
    'Claude Haiku 4.5',
    1.00,
    5.00,
    true,
    true,
    'active',
    true,
    'Fallback vision per analisi scena e QA render.'
  ),
  (
    'openai/gpt-4o-mini',
    'openai',
    'GPT-4o mini',
    0.15,
    0.60,
    true,
    true,
    'active',
    true,
    'Fallback economico vision per analisi scena e QA render.'
  )
ON CONFLICT (model_id) DO UPDATE SET
  provider = EXCLUDED.provider,
  display_name = EXCLUDED.display_name,
  pricing_input_usd_1m = EXCLUDED.pricing_input_usd_1m,
  pricing_output_usd_1m = EXCLUDED.pricing_output_usd_1m,
  supports_vision = EXCLUDED.supports_vision,
  supports_json_mode = EXCLUDED.supports_json_mode,
  status = EXCLUDED.status,
  whitelisted = EXCLUDED.whitelisted,
  notes = EXCLUDED.notes,
  last_synced_at = now();

-- 4b) Catalogo modelli OpenRouter attuali usati dalle config generali.
INSERT INTO public.ai_model_catalog (
  model_id,
  provider,
  display_name,
  pricing_input_usd_1m,
  pricing_output_usd_1m,
  supports_vision,
  supports_json_mode,
  status,
  whitelisted,
  notes
)
VALUES
  (
    'anthropic/claude-sonnet-4',
    'anthropic',
    'Claude Sonnet 4',
    3.00,
    15.00,
    true,
    true,
    'active',
    true,
    'Modello OpenRouter verificato dal catalogo pubblico.'
  ),
  (
    'anthropic/claude-sonnet-4.5',
    'anthropic',
    'Claude Sonnet 4.5',
    3.00,
    15.00,
    true,
    true,
    'active',
    true,
    'Modello OpenRouter verificato dal catalogo pubblico.'
  ),
  (
    'moonshotai/kimi-k2.5',
    'moonshotai',
    'Kimi K2.5',
    0.40,
    1.90,
    true,
    true,
    'active',
    true,
    'Sostituisce moonshot/kimi-k2, non piu'' esposto da OpenRouter.'
  ),
  (
    'moonshotai/kimi-k2.6',
    'moonshotai',
    'Kimi K2.6',
    0.73,
    3.49,
    true,
    true,
    'active',
    true,
    'Modello OpenRouter verificato dal catalogo pubblico.'
  ),
  (
    'deepseek/deepseek-chat-v3.1',
    'deepseek',
    'DeepSeek Chat V3.1',
    0.21,
    0.79,
    false,
    true,
    'active',
    true,
    'Sostituisce deepseek/deepseek-v3, non piu'' esposto da OpenRouter.'
  ),
  (
    'google/gemini-2.5-pro',
    'google',
    'Gemini 2.5 Pro',
    1.25,
    10.00,
    true,
    true,
    'active',
    true,
    'Sostituisce google/gemini-pro-2.5, non piu'' esposto da OpenRouter.'
  ),
  (
    'openai/gpt-4o',
    'openai',
    'GPT-4o',
    2.50,
    10.00,
    true,
    true,
    'active',
    true,
    'Modello OpenRouter verificato dal catalogo pubblico.'
  )
ON CONFLICT (model_id) DO UPDATE SET
  provider = EXCLUDED.provider,
  display_name = EXCLUDED.display_name,
  pricing_input_usd_1m = EXCLUDED.pricing_input_usd_1m,
  pricing_output_usd_1m = EXCLUDED.pricing_output_usd_1m,
  supports_vision = EXCLUDED.supports_vision,
  supports_json_mode = EXCLUDED.supports_json_mode,
  status = EXCLUDED.status,
  whitelisted = EXCLUDED.whitelisted,
  notes = EXCLUDED.notes,
  last_synced_at = now();

UPDATE public.ai_model_catalog
SET status = 'deprecated',
    whitelisted = false,
    notes = COALESCE(notes, '') || ' [DEPRECATED: non usare per nuovi task OpenRouter.]',
    last_synced_at = now()
WHERE model_id IN (
  'openai/dall-e-2',
  'openai/dall-e-3',
  'dall-e-2',
  'dall-e-3',
  'anthropic/claude-haiku-4',
  'moonshot/kimi-k2',
  'deepseek/deepseek-v3',
  'google/gemini-flash-2.5',
  'google/gemini-pro-2.5',
  'google/gemini-2.5-flash-image-preview'
);

-- 5) Pricing provider per cost capture render.
INSERT INTO public.render_provider_pricing (
  provider_key,
  model,
  pricing_mode,
  price_output_image_eur,
  fallback_cost_per_call_eur,
  effective_from,
  notes
)
VALUES
  (
    'openrouter_image',
    'google/gemini-2.5-flash-image',
    'per_image',
    0.039,
    0.039,
    '2026-05-14 00:00:00+00'::timestamptz,
    'Nano Banana via OpenRouter. Se x-or-cost e'' presente viene usato il costo reale.'
  ),
  (
    'openai',
    'gpt-image-1.5',
    'per_image',
    0.040,
    0.040,
    '2026-05-14 00:00:00+00'::timestamptz,
    'Fallback diretto OpenAI GPT Image 1.5.'
  ),
  (
    'openai',
    'gpt-image-1',
    'per_image',
    0.053,
    0.053,
    '2026-05-14 00:00:00+00'::timestamptz,
    'Ultimo fallback diretto OpenAI GPT Image 1.'
  )
ON CONFLICT (provider_key, model, effective_from) DO UPDATE SET
  pricing_mode = EXCLUDED.pricing_mode,
  price_output_image_eur = EXCLUDED.price_output_image_eur,
  fallback_cost_per_call_eur = EXCLUDED.fallback_cost_per_call_eur,
  notes = EXCLUDED.notes,
  effective_to = NULL;

-- 6) Config provider canonico per contabilita', senza cambiare i default legacy.
INSERT INTO public.render_provider_config (
  provider_key,
  label,
  model,
  api_endpoint,
  is_default,
  is_active,
  cost_real_per_render,
  markup_multiplier,
  cost_billed_per_render,
  renders_generated,
  notes
)
VALUES (
  'openrouter_image',
  'OpenRouter Image — Nano Banana',
  'google/gemini-2.5-flash-image',
  'https://openrouter.ai/api/v1/chat/completions',
  false,
  true,
  0.039,
  4.00,
  0.156,
  0,
  'Provider canonico del nuovo flusso generate-render. Non e'' default finche'' tutti i verticali non sono migrati.'
)
ON CONFLICT (provider_key) DO UPDATE SET
  label = EXCLUDED.label,
  model = EXCLUDED.model,
  api_endpoint = EXCLUDED.api_endpoint,
  is_active = true,
  cost_real_per_render = EXCLUDED.cost_real_per_render,
  markup_multiplier = EXCLUDED.markup_multiplier,
  cost_billed_per_render = EXCLUDED.cost_billed_per_render,
  notes = EXCLUDED.notes;

UPDATE public.render_provider_config
SET model = 'gpt-image-1.5',
    is_active = true,
    cost_real_per_render = 0.040,
    cost_billed_per_render = 0.156,
    notes = COALESCE(notes, '') || ' [Fallback render AI unificato.]'
WHERE provider_key = 'openai';

-- 7) Session audit/idempotency.
ALTER TABLE public.render_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS prompt_original text,
  ADD COLUMN IF NOT EXISTS prompt_retried boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_chain_used jsonb;

CREATE INDEX IF NOT EXISTS ix_render_sessions_idempotency
  ON public.render_sessions(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.render_sessions.idempotency_key IS
  'Hash session_id+config per evitare doppie generazioni da doppio click o retry client.';
COMMENT ON COLUMN public.render_sessions.prompt_original IS
  'Prompt iniziale prima di eventuale retry correttivo post QA.';
COMMENT ON COLUMN public.render_sessions.prompt_retried IS
  'TRUE se il render finale deriva da un retry correttivo.';
COMMENT ON COLUMN public.render_sessions.provider_chain_used IS
  'Modelli/provider tentati durante la generazione render.';

COMMIT;
