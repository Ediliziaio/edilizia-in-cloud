-- ============================================================================
-- Proposta per significato nel popup «Collega al listino» (11/11/2026):
-- il compito del router per `listino-abbina-ai`. Scelta fra pochi candidati,
-- risposta corta in JSON: modello economico, temperatura zero.
-- ============================================================================

insert into public.ai_router_config (task_key, task_label, task_description, primary_model, fallback_models, default_params, category, tier_key, enabled)
select 'listino_abbina_voci', 'Collega voci del computo al listino',
       'Per ogni voce del computo sceglie fra alcuni candidati la voce di listino che è la stessa lavorazione, o nessuna',
       'google/gemini-2.5-flash', '["openai/gpt-4o-mini", "anthropic/claude-haiku-4.5"]'::jsonb,
       '{"max_tokens": 3000, "temperature": 0}'::jsonb, 'extraction', 't1_economic', true
 where not exists (select 1 from public.ai_router_config where task_key = 'listino_abbina_voci');
