-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Task router per generare i TESTI del template preventivo Ristrutturazione.
-- Modello testo (clona da listino_extract = google/gemini-2.5-flash). Idempotente.
INSERT INTO public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models,
   default_params, category, estimated_cost_per_million, enabled, tier_key)
SELECT
  'template_ristrutturazione',
  'Genera testi template Ristrutturazione',
  'Genera i testi del template preventivo Ristrutturazione (chi siamo, esigenze, soluzione, USP, garanzie, FAQ, percorso, cronoprogramma, condizioni, copertina) dal profilo azienda',
  primary_model, fallback_models, default_params, category,
  estimated_cost_per_million, enabled, tier_key
FROM public.ai_router_config
WHERE task_key = 'listino_extract'
ON CONFLICT (task_key) DO NOTHING;
