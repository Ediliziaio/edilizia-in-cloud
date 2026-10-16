-- Render AI provider routing chain:
--   1. Gemini direct
--   2. OpenRouter -> Gemini image
--   3. OpenRouter -> OpenAI image
--   4. OpenAI direct
--
-- Idempotent and safe to run multiple times.

-- Questi seed precedono le fondazioni render di agosto e settembre.
-- Anticipa le stesse due definizioni, comprese le policy solo super admin.
DO $render_foundation_dependencies$
BEGIN
 IF to_regclass('public.render_provider_config') IS NULL THEN
CREATE TABLE IF NOT EXISTS public.render_provider_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key text NOT NULL UNIQUE,
  label text NOT NULL,
  model text NOT NULL,
  api_endpoint text NOT NULL,
  is_active boolean DEFAULT false,
  is_default boolean DEFAULT false,
  quality text DEFAULT 'high',
  timeout_sec integer DEFAULT 120,
  cost_real_per_render numeric DEFAULT 0.04,
  markup_multiplier numeric DEFAULT 2.5,
  cost_billed_per_render numeric DEFAULT 0.10,
  renders_generated integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_provider_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_render_provider" ON public.render_provider_config;
CREATE POLICY "sa_render_provider" ON public.render_provider_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));


 END IF;
 IF to_regclass('public.render_provider_pricing') IS NULL THEN
CREATE TABLE IF NOT EXISTS public.render_provider_pricing (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key text NOT NULL,
  model text NOT NULL,
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('per_image','per_token','hybrid')),
  price_input_image_eur numeric(10,8) NOT NULL DEFAULT 0,
  price_input_token_eur numeric(12,10) NOT NULL DEFAULT 0,
  price_output_image_eur numeric(10,8) NOT NULL DEFAULT 0,
  price_output_token_eur numeric(12,10) NOT NULL DEFAULT 0,
  -- Fallback deterministico quando l'API non ritorna usage (per_image mode):
  fallback_cost_per_call_eur numeric(10,6) NOT NULL DEFAULT 0,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_key, model, effective_from)
);
ALTER TABLE public.render_provider_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_provider_pricing" ON public.render_provider_pricing;
CREATE POLICY "sa_provider_pricing" ON public.render_provider_pricing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));


 END IF;
END $render_foundation_dependencies$;

INSERT INTO public.platform_settings (key, value)
VALUES ('render_default_provider', 'gemini')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.render_provider_config (
  provider_key,
  label,
  model,
  api_endpoint,
  is_active,
  is_default,
  cost_real_per_render,
  markup_multiplier,
  cost_billed_per_render,
  notes
)
VALUES
  (
    'gemini',
    'Google Gemini Flash Image',
    'gemini-2.5-flash-image',
    'https://generativelanguage.googleapis.com/v1beta/models',
    true,
    true,
    0.0367,
    4.00,
    0.156,
    'Provider primario render AI. Usa GEMINI_API_KEY/GOOGLE_API_KEY dai Supabase secrets.'
  ),
  (
    'openrouter_image',
    'OpenRouter Image Fallback',
    'google/gemini-2.5-flash-image',
    'https://openrouter.ai/api/v1/chat/completions',
    true,
    false,
    0.039,
    4.00,
    0.156,
    'Fallback via OpenRouter: prima Gemini image, poi OpenAI image se Gemini non risponde.'
  ),
  (
    'openai',
    'OpenAI Image Direct',
    'gpt-image-1.5',
    'https://api.openai.com/v1/images/edits',
    true,
    false,
    0.040,
    4.00,
    0.156,
    'Ultimo fallback diretto se Gemini e OpenRouter non generano il render.'
  )
ON CONFLICT (provider_key) DO UPDATE SET
  label = EXCLUDED.label,
  model = EXCLUDED.model,
  api_endpoint = EXCLUDED.api_endpoint,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default,
  cost_real_per_render = EXCLUDED.cost_real_per_render,
  markup_multiplier = EXCLUDED.markup_multiplier,
  cost_billed_per_render = EXCLUDED.cost_billed_per_render,
  notes = EXCLUDED.notes;

WITH pricing_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        'gemini',
        'gemini-2.5-flash-image',
        'per_image',
        0::numeric,
        0::numeric,
        0.0367::numeric,
        0::numeric,
        0.0367::numeric,
        'Gemini direct image render fallback cost per output image.'
      ),
      (
        'openrouter_image',
        'google/gemini-2.5-flash-image',
        'per_image',
        0::numeric,
        0::numeric,
        0.039::numeric,
        0::numeric,
        0.039::numeric,
        'OpenRouter Gemini image fallback. Prefer x-or-cost header when available.'
      ),
      (
        'openrouter_image',
        'openai/gpt-image-1.5',
        'per_image',
        0::numeric,
        0::numeric,
        0.040::numeric,
        0::numeric,
        0.040::numeric,
        'OpenRouter OpenAI image fallback. Prefer x-or-cost header when available.'
      ),
      (
        'openai',
        'gpt-image-1.5',
        'per_image',
        0::numeric,
        0::numeric,
        0.040::numeric,
        0::numeric,
        0.040::numeric,
        'OpenAI direct image fallback.'
      )
  ) AS v(
    provider_key,
    model,
    pricing_mode,
    price_input_image_eur,
    price_input_token_eur,
    price_output_image_eur,
    price_output_token_eur,
    fallback_cost_per_call_eur,
    notes
  )
),
updated AS (
  UPDATE public.render_provider_pricing p
  SET
    pricing_mode = r.pricing_mode,
    price_input_image_eur = r.price_input_image_eur,
    price_input_token_eur = r.price_input_token_eur,
    price_output_image_eur = r.price_output_image_eur,
    price_output_token_eur = r.price_output_token_eur,
    fallback_cost_per_call_eur = r.fallback_cost_per_call_eur,
    notes = r.notes
  FROM pricing_rows r
  WHERE p.provider_key = r.provider_key
    AND p.model = r.model
    AND p.effective_to IS NULL
  RETURNING p.provider_key, p.model
)
INSERT INTO public.render_provider_pricing (
  provider_key,
  model,
  pricing_mode,
  price_input_image_eur,
  price_input_token_eur,
  price_output_image_eur,
  price_output_token_eur,
  fallback_cost_per_call_eur,
  notes
)
SELECT
  r.provider_key,
  r.model,
  r.pricing_mode,
  r.price_input_image_eur,
  r.price_input_token_eur,
  r.price_output_image_eur,
  r.price_output_token_eur,
  r.fallback_cost_per_call_eur,
  r.notes
FROM pricing_rows r
WHERE NOT EXISTS (
  SELECT 1
  FROM updated u
  WHERE u.provider_key = r.provider_key
    AND u.model = r.model
);
