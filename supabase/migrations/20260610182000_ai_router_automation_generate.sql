-- 2026-06-10 (audit AI): task router per la generazione di automazioni da
-- linguaggio naturale (edge function ai-genera-automazione). Output JSON
-- strutturato vincolato al catalogo → serve un modello capace ma economico:
-- Haiku 4.5 primary, fallback Llama/DeepSeek. Se la riga non viene applicata
-- il router cade comunque sul default (gpt-4o-mini), quindi non bloccante.

INSERT INTO public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models, category, estimated_cost_per_million, tier_key, default_params)
VALUES
  ('automation_generate', 'Genera automazione da descrizione',
   'Mappa una descrizione in linguaggio naturale in un flusso (trigger + azioni) scelto dal catalogo',
   'anthropic/claude-haiku-4.5',
   '["meta-llama/llama-3.3-70b-instruct", "openai/gpt-4o-mini"]'::jsonb,
   'generation', 1.00, 't3_balanced',
   '{"temperature": 0.3, "max_tokens": 1200}'::jsonb)
ON CONFLICT (task_key) DO NOTHING;
