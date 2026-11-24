-- Router AI: compito «campo_scontrino» (24/11/2026). La funzione campo-scontrino-leggi legge la foto dello
-- scontrino che l'operaio manda dall'app (importo, data, tipo) e compila la spesa. Stessa classe di prezzo
-- della lettura fatture; davanti Gemini 2.5 Flash, rapido ed economico sulle foto.
insert into public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models,
   default_params, category, estimated_cost_per_million, enabled, tier_key)
select
  'campo_scontrino',
  'Scontrino delle spese operai (AI)',
  'Legge la foto di uno scontrino (importo, data, tipo) e compila la spesa dell''operaio nell''app di cantiere',
  'google/gemini-2.5-flash',
  '["openai/gpt-4o-mini", "anthropic/claude-haiku-4.5"]'::jsonb,
  default_params, category, estimated_cost_per_million, enabled, tier_key
from public.ai_router_config
where task_key = 'fattura_ricevuta_ocr'
on conflict (task_key) do nothing;
