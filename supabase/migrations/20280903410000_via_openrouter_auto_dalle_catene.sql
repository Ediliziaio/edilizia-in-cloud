-- ════════════════════════════════════════════════════════════════════════════
-- Via "openrouter/auto" dalle catene di ripiego
-- ════════════════════════════════════════════════════════════════════════════
-- Chiudeva la catena di TUTTI i 55 task configurati, e su ai_model_config era
-- perfino il modello PRIMARIO di 'chat_routine'. Non e' un modello: e'
-- "scegli tu". Tre problemi, tutti visti in produzione:
--   · il modello effettivo cambia a ogni chiamata, quindi il costo e'
--     imprevedibile (dai tier economici fino a 10-40x);
--   · l'altro router lo prezzava a occhio 1,5/6,0 $ per milione, che con un
--     modello premium e' una sottostima secca — e su quella stima si addebita;
--   · il 23 agosto ha risposto due volte 402 "crediti esauriti" facendo
--     fallire la richiesta proprio nel momento in cui doveva fare da rete.
-- Un ripiego che non si sa cosa sia non e' un ripiego. Al suo posto un modello
-- economico vero, con vision e tool use, che non sia gia' altrove in catena
-- (altrimenti il tentativo di riserva e' un doppione del precedente).
--
-- Il paracadute e' anche nel codice: aiRouter.normalizeConfig lo scarta se
-- qualcuno lo rimette dal pannello admin, e il pannello non lo offre piu'.
-- ════════════════════════════════════════════════════════════════════════════

WITH pulito AS (
  SELECT
    c.id,
    c.primary_model,
    COALESCE((
      SELECT jsonb_agg(m ORDER BY ord)
      FROM jsonb_array_elements_text(c.fallback_models) WITH ORDINALITY AS u(m, ord)
      WHERE m <> 'openrouter/auto'
    ), '[]'::jsonb) AS senza_auto
  FROM public.ai_router_config c
  WHERE c.fallback_models ? 'openrouter/auto'
)
UPDATE public.ai_router_config c
SET fallback_models = p.senza_auto || COALESCE((
      SELECT to_jsonb(ARRAY[m])
      FROM unnest(ARRAY['openai/gpt-4o-mini','anthropic/claude-haiku-4.5','google/gemini-2.5-flash']) AS m
      WHERE m <> p.primary_model AND NOT (p.senza_auto ? m)
      LIMIT 1
    ), '[]'::jsonb),
    updated_at = now()
FROM pulito p
WHERE c.id = p.id;

UPDATE public.ai_model_config
SET primary_model = 'openai/gpt-4o-mini',
    fallback_chain = '["anthropic/claude-haiku-4.5","google/gemini-2.5-flash"]'::jsonb,
    updated_at = now()
WHERE primary_model = 'openrouter/auto';

UPDATE public.ai_model_config
SET fallback_chain = COALESCE((
      SELECT jsonb_agg(m ORDER BY ord)
      FROM jsonb_array_elements_text(fallback_chain) WITH ORDINALITY AS u(m, ord)
      WHERE m <> 'openrouter/auto'
    ), '[]'::jsonb) || '["google/gemini-2.5-flash"]'::jsonb,
    updated_at = now()
WHERE fallback_chain ? 'openrouter/auto';
