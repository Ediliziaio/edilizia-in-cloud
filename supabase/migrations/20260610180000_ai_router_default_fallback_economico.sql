-- 2026-06-10 (audit AI, costi): il fallback per i task NON configurati era
-- "openrouter/auto", che delega a OpenRouter la scelta del modello e può
-- selezionare modelli premium (prezzo imprevedibile, fino a 10-40x rispetto
-- ai tier economici). Sostituito con una catena deterministica e cheap:
-- Llama 3.3 70B (€0.38/1M) → Claude Haiku 4.5 (€1/1M). Il primary resta
-- gpt-4o-mini. Identica modifica nel fallback hard-coded di
-- supabase/functions/_shared/aiRouter.ts (loadConfig).
-- I task CONFIGURATI non cambiano: le loro catene sono già economiche.

CREATE OR REPLACE FUNCTION public.get_ai_router_config(p_task_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
    RETURN jsonb_build_object(
      'task_key', p_task_key,
      'primary_model', 'openai/gpt-4o-mini',
      'fallback_models', '["meta-llama/llama-3.3-70b-instruct", "anthropic/claude-haiku-4.5"]'::jsonb,
      'default_params', '{"temperature": 0.3, "max_tokens": 2000}'::jsonb,
      'tier_key', 't2_vision',
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
    'tier_key', COALESCE(v_config.tier_key, 't1_economic'),
    'is_default', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_router_config FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_router_config TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ai_router_config IS
  'Ritorna config router per un task_key. Fallback safe ECONOMICO (no openrouter/auto) se non configurato.';
