-- Router config for AI tasks migrated from direct provider calls.

INSERT INTO public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models, category, estimated_cost_per_million, default_params, tier_key, enabled)
VALUES
  ('message_analysis', 'Analisi messaggi operativi', 'Classifica messaggi inbound e suggerisce azioni senza eseguirle',
   'openai/gpt-4o-mini',
   '["deepseek/deepseek-chat-v3.1", "anthropic/claude-haiku-4.5"]'::jsonb,
   'classification', 0.60,
   '{"temperature": 0.1, "max_tokens": 1600}'::jsonb,
   't2_vision', true),
  ('fattura_ricevuta_ocr', 'OCR fattura passiva', 'Estrae JSON strutturato da fatture passive PDF/immagine',
   'openai/gpt-4o-mini',
   '["openai/gpt-4o", "anthropic/claude-haiku-4.5"]'::jsonb,
   'extraction', 0.60,
   '{"temperature": 0.0, "max_tokens": 3500}'::jsonb,
   't2_vision', true),
  ('automation_message_generate', 'Generazione messaggi automazione', 'Genera testo per automazioni email/SMS senza chiamate provider dirette',
   'openai/gpt-4o-mini',
   '["deepseek/deepseek-chat-v3.1", "anthropic/claude-haiku-4.5"]'::jsonb,
   'automation', 0.60,
   '{"temperature": 0.35, "max_tokens": 1024}'::jsonb,
   't2_vision', true),
  ('duvri_generate', 'Generazione DUVRI', 'Genera documenti DUVRI strutturati con supervisione utente e ledger AI',
   'anthropic/claude-haiku-4.5',
   '["openai/gpt-4o-mini", "deepseek/deepseek-chat-v3.1"]'::jsonb,
   'compliance', 0.80,
   '{"temperature": 0.1, "max_tokens": 2200}'::jsonb,
   't3_balanced', true)
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
