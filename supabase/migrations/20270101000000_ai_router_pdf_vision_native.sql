-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 7 — PDF Vision Nativo via OpenRouter (Gemini Flash 2.5 + Claude)
-- ════════════════════════════════════════════════════════════════════════════
-- BUG: extractFromPDFVision in computo-ai-extract era un placeholder che NON
-- faceva vero OCR — se pdfjs-dist non estraeva testo, ritornava capitolo
-- vuoto e l'utente vedeva "nessuna informazione trovata".
--
-- FIX: aggiungiamo task `pdf_vision_extract` che usa modelli capaci di leggere
-- PDF nativamente via OpenRouter (`type: "file"` con base64 PDF):
--   - PRIMARY: google/gemini-flash-2.5  (best price/quality, 1M context, PDF native)
--   - FALLBACK: anthropic/claude-haiku-4.5 + openai/gpt-4o-mini
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.ai_router_config (
  task_key, task_label, task_description,
  primary_model, fallback_models,
  category, estimated_cost_per_million, default_params, enabled
) VALUES
  ('pdf_vision_extract',
   'OCR PDF scansionato (vision)',
   'Estrazione testo+struttura da PDF scansionato/immagine via Gemini/Claude vision nativo (no canvas needed)',
   'google/gemini-flash-2.5',
   '["anthropic/claude-haiku-4.5", "openai/gpt-4o-mini"]'::jsonb,
   'extraction',
   0.40,
   '{"temperature": 0.1, "max_tokens": 8000}'::jsonb,
   true)
ON CONFLICT (task_key) DO UPDATE SET
  task_label = EXCLUDED.task_label,
  task_description = EXCLUDED.task_description,
  primary_model = EXCLUDED.primary_model,
  fallback_models = EXCLUDED.fallback_models,
  estimated_cost_per_million = EXCLUDED.estimated_cost_per_million,
  default_params = EXCLUDED.default_params,
  enabled = true,
  updated_at = now();

-- Pricing markup: ai_pricing_markup usa task_kind con CHECK enum chiuso.
-- Per non rompere l'enum riusiamo `vision_cantiere` come "tipo" di markup
-- (stessa fascia prezzo: vision multimodale). Nessuna nuova riga necessaria.
