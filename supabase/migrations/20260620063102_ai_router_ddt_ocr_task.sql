-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

INSERT INTO public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models,
   default_params, category, estimated_cost_per_million, enabled, tier_key)
SELECT
  'ddt_ocr',
  'Analisi DDT (AI)',
  'Estrae fornitore, numero/data DDT e righe prodotto da foto o PDF del documento di trasporto',
  primary_model, fallback_models, default_params, category,
  estimated_cost_per_million, enabled, tier_key
FROM public.ai_router_config
WHERE task_key = 'listino_extract'
ON CONFLICT (task_key) DO NOTHING;
