-- ════════════════════════════════════════════════════════════════════════════
-- AI TEST LAB — Run metadata sui messaggi chat (model, costo, latenza)
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge a `internal_chat_messages` le colonne per mostrare sotto ogni
-- messaggio AI il footer "⏱ 2.3s · 🟠 Kimi K2 · $0.012".
--
-- Le colonne sono popolate per OGNI messaggio AI (non solo demo) ma il
-- componente AIRunFooter le visualizza in UI SOLO per Demo Azienda
-- (gating frontend tramite useAIModelSelector.showSelector).
--
-- Additive + idempotente.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.internal_chat_messages
  ADD COLUMN IF NOT EXISTS last_model_id text,
  ADD COLUMN IF NOT EXISTS last_provider text,
  ADD COLUMN IF NOT EXISTS last_cost_usd numeric(10, 6),
  ADD COLUMN IF NOT EXISTS last_latency_ms int,
  ADD COLUMN IF NOT EXISTS last_input_tokens int,
  ADD COLUMN IF NOT EXISTS last_output_tokens int,
  ADD COLUMN IF NOT EXISTS last_generation_id text;

COMMENT ON COLUMN public.internal_chat_messages.last_model_id IS
  'AI Test Lab — modello OpenRouter usato per generare la risposta (es. moonshotai/kimi-k2).';
COMMENT ON COLUMN public.internal_chat_messages.last_cost_usd IS
  'AI Test Lab — costo USD reale della chiamata (da OpenRouter usage.cost).';
COMMENT ON COLUMN public.internal_chat_messages.last_latency_ms IS
  'AI Test Lab — tempo totale di risposta del modello (ms).';
COMMENT ON COLUMN public.internal_chat_messages.last_generation_id IS
  'AI Test Lab — id generation OpenRouter per audit/debug.';
