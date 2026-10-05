-- Listino del render passato da OpenRouter con GPT-5 Image: il prezzo vero.
--
-- render_provider_config dice che il ripiego OpenRouter (openai/gpt-5-image) costa
-- 0,039 € a render. La fattura di OpenRouter per la settimana del 30/08/2026 dice
-- altro: 3,37 $ addebitati per GPT-5 Image contro 0,44 $ registrati dalle sessioni,
-- cioè circa 0,4 $ a immagine, dieci volte tanto.
--
-- In render_provider_pricing per la coppia (openrouter_image, openai/gpt-5-image)
-- non c'era NESSUNA riga: captureRealCost cadeva sul prezzo di config e il costo
-- vero non veniva usato nemmeno quando l'API lo mandava. Con questa riga
-- computeOpenRouterImageCost usa il costo vero della chiamata (usage.cost, che
-- image.ts ora chiede con `usage: { include: true }`) e, quando manca, 0,39 € —
-- la media misurata (≈0,42 $ × 0,92) — invece di 0,039.
--
-- NON cambia nulla per i clienti: cost_billed_per_render (0,156 €) resta quello di
-- render_provider_config. Cambia ciò che si registra come costo reale. Ne esce un
-- fatto da decidere: un render servito dal ripiego costa circa 0,39 € e si
-- fattura 0,156 €, cioè perde circa 0,23 € a render (18 render finora). O si alza
-- cost_billed_per_render di quel provider, o si evita GPT-5 Image come ripiego.
--
-- Idempotente: non fa niente se esiste già una riga attiva per la coppia.

insert into public.render_provider_pricing
  (provider_key, model, pricing_mode, price_input_image_eur, price_input_token_eur,
   price_output_image_eur, price_output_token_eur, fallback_cost_per_call_eur, notes)
select
  'openrouter_image', 'openai/gpt-5-image', 'per_image', 0, 0, 0.39, 0, 0.39,
  'Misurato sulla fattura OpenRouter del 30/08/2026: 3,37 $ per GPT-5 Image contro 0,44 $ registrati, circa 0,42 $ a immagine. Vale solo se la risposta non porta usage.cost.'
where not exists (
  select 1 from public.render_provider_pricing
   where provider_key = 'openrouter_image'
     and model = 'openai/gpt-5-image'
     and effective_to is null
);
