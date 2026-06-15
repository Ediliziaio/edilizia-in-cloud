-- ============================================================================
-- Outreach — intent/sentiment AI sulle risposte (Unibox NLP)
-- ============================================================================
-- Aggiunge l'etichetta di intento calcolata dall'AI su ogni risposta in arrivo
-- (interested / not_interested / out_of_office / unsubscribe / auto_reply /
-- question / other) + confidenza. Additiva e idempotente.
--
-- NOTA: migrazione LOCALE — applicare via MCP apply_migration (vedi runbook).
-- ============================================================================

ALTER TABLE public.outreach_replies
  ADD COLUMN IF NOT EXISTS intent            text,
  ADD COLUMN IF NOT EXISTS intent_confidence numeric;

-- Filtro inbox per intento (es. "mostra solo gli interessati")
CREATE INDEX IF NOT EXISTS idx_outreach_replies_intent
  ON public.outreach_replies (company_id, intent, received_at DESC);
