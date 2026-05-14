-- Config router AI per il preventivatore serramenti.
-- Locale/idempotente: non crea dati business, prepara solo i task OpenRouter.

INSERT INTO public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models, category, estimated_cost_per_million, default_params, tier_key, enabled)
VALUES
  (
    'serramenti_text_to_quote',
    'Bozza preventivo serramenti da testo/audio',
    'Trasforma richiesta commerciale, appunti o trascrizione audio in righe preventivo serramenti da approvare',
    'anthropic/claude-haiku-4.5',
    '["openai/gpt-4o-mini", "deepseek/deepseek-chat-v3.1"]'::jsonb,
    'sales',
    0.80,
    '{"temperature": 0.1, "max_tokens": 3500}'::jsonb,
    't3_balanced',
    true
  ),
  (
    'serramenti_photo_to_quote',
    'Bozza preventivo serramenti da foto',
    'Analizza foto di rilievo, appunti o infissi esistenti e propone righe preventivo serramenti da approvare',
    'openai/gpt-4o-mini',
    '["anthropic/claude-haiku-4.5", "google/gemini-flash-2.5"]'::jsonb,
    'vision',
    1.20,
    '{"temperature": 0.1, "max_tokens": 3500}'::jsonb,
    't3_balanced',
    true
  )
ON CONFLICT (task_key) DO UPDATE SET
  task_label = EXCLUDED.task_label,
  task_description = EXCLUDED.task_description,
  primary_model = EXCLUDED.primary_model,
  fallback_models = EXCLUDED.fallback_models,
  category = EXCLUDED.category,
  estimated_cost_per_million = EXCLUDED.estimated_cost_per_million,
  default_params = EXCLUDED.default_params,
  tier_key = EXCLUDED.tier_key,
  enabled = EXCLUDED.enabled,
  updated_at = now();
