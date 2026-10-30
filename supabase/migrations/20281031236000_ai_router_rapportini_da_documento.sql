-- Router AI: compito «rapportini_da_documento» (31/10/2026).
-- La funzione ai-rapportini-da-documento legge rapportini di carta fotografati,
-- fogli presenze e PDF. Parte dalla configurazione della lettura fatture
-- (stessa classe di prezzo, legge PDF e foto) e mette davanti Gemini 2.5 Flash,
-- che legge bene le scritte a mano e i PDF di più pagine.

insert into public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models,
   default_params, category, estimated_cost_per_million, enabled, tier_key)
select
  'rapportini_da_documento',
  'Rapportini da documenti (AI)',
  'Legge rapportini di carta, fogli presenze e PDF di cantiere e propone i rapportini giornalieri della commessa',
  'google/gemini-2.5-flash',
  '["openai/gpt-4o", "anthropic/claude-haiku-4.5"]'::jsonb,
  default_params, category, estimated_cost_per_million, enabled, tier_key
from public.ai_router_config
where task_key = 'fattura_ricevuta_ocr'
on conflict (task_key) do nothing;
