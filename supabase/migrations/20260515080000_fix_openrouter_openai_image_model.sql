-- Fix render AI provider chain (2026-05-15)
-- ---------------------------------------------------------------------------
-- Bug: il modello `openai/gpt-image-1.5` NON esiste nel catalog OpenRouter,
-- causando un 404 sul Tier 3 della chain. Verificato con la edge function
-- `debug-ai-providers`. Modelli OpenAI image realmente disponibili oggi su
-- OpenRouter: openai/gpt-5-image, openai/gpt-5-image-mini, openai/gpt-5.4-image-2.
--
-- Cambiamo a `openai/gpt-5-image` come default stabile.
-- Idempotente: usa UPDATE su record esistenti.

UPDATE public.render_provider_config
   SET model = 'openai/gpt-5-image',
       notes = 'Fallback via OpenRouter usando openai/gpt-5-image (modello image OpenAI corrente). Aggiornato 2026-05-15 dopo discovery via debug-ai-providers.'
 WHERE provider_key = 'openrouter_image'
   AND model = 'google/gemini-2.5-flash-image';
-- Nota: la migration originale popola openrouter_image con model
-- google/gemini-2.5-flash-image (il tier 2 Gemini via OpenRouter).
-- Il tier 3 OpenAI via OpenRouter NON ha un record separato perché la
-- chain interna in image.ts usa constanti TS hardcoded. La fix vera è in
-- image.ts (IMAGE_MODEL_OPENROUTER_OPENAI).

-- Aggiorna anche pricing/fallback_models se la tabella render_ai_providers
-- esiste (introdotta dalla migration 20270514180000).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'render_ai_providers'
  ) THEN
    UPDATE public.render_ai_providers
       SET fallback_models = '["openai/gpt-5-image","openai/gpt-5-image-mini","openai/gpt-5.4-image-2"]'::jsonb
     WHERE primary_model = 'google/gemini-2.5-flash-image'
       AND fallback_models::text LIKE '%gpt-image-1.5%';

    -- Rimuovi record orfani con modello inesistente
    DELETE FROM public.render_ai_providers
     WHERE primary_model = 'openai/gpt-image-1.5';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
