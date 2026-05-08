-- ════════════════════════════════════════════════════════════════════════════
-- AI TEST LAB — Track "requested_model" per detection fallback in UI
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge `requested_model_id` su internal_chat_messages: il modello che
-- l'utente demo ha SELEZIONATO nel selettore UI prima dell'invio.
--
-- Se `last_model_id != requested_model_id` significa che il primary è fallito
-- e aiRouter ha usato un fallback. L'UI evidenzia questo mismatch mostrando
-- "⚠️ Risposta da [fallback] (Kimi K2.6 non disponibile)".
--
-- Additive + idempotente.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.internal_chat_messages
  ADD COLUMN IF NOT EXISTS requested_model_id text;

COMMENT ON COLUMN public.internal_chat_messages.requested_model_id IS
  'AI Test Lab — modello scelto dall''utente demo nel selettore UI. Se diverso da last_model_id significa fallback automatico.';
