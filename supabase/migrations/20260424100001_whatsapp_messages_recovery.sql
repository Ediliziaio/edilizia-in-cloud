-- =============================================================================
-- P1-1 — whatsapp_messages: Dead Letter Queue + recovery cron
-- =============================================================================
-- Risolve il bug P1 "whatsapp-ai-processor fire-and-forget senza DLQ":
-- whatsapp-webhook invocava whatsapp-ai-processor in fire-and-forget
-- (.catch(console.error)). Se il processor era in timeout, crashato o
-- rate-limited il messaggio restava in processing_status='received' per
-- sempre, senza retry né visibilità.
--
-- Questa migration aggiunge il tracking per un cron di recovery:
--   - processing_attempts: counter tentativi
--   - last_processing_attempt_at: timestamp ultimo tentativo
--   - processing_error: stringa errore dell'ultimo fallimento (già esistente
--     dalla migration 20260914000001, ma ci assicuriamo sia presente)
--   - nuovo status 'failed_max_retries' dopo 5 tentativi
--   - indice parziale per trovare velocemente i messaggi stuck
-- =============================================================================

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS processing_attempts int NOT NULL DEFAULT 0;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS last_processing_attempt_at timestamptz;

-- processing_error è già stato creato dalla migration 20260914000001 ma
-- lo aggiungiamo IF NOT EXISTS per sicurezza in caso di re-apply.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS processing_error text;

-- Indice parziale: il cron di recovery deve trovare velocemente solo i messaggi
-- ancora 'received'. Con milioni di righe 'processed' l'indice parziale
-- resta piccolo.
CREATE INDEX IF NOT EXISTS idx_wa_msg_stuck
  ON public.whatsapp_messages (processing_status, created_at)
  WHERE processing_status = 'received';

-- Amplia il CHECK constraint per includere i nuovi stati di processing.
-- Drop idempotente: se il constraint non esiste (prima applicazione) continua.
ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_processing_status_check;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_processing_status_check
  CHECK (processing_status IN (
    'received',
    'processing',
    'processed',
    'failed',
    'failed_max_retries',
    'requires_confirmation'
  ));

COMMENT ON COLUMN public.whatsapp_messages.processing_attempts IS
  'P1-1: counter tentativi di processing. Reset a 0 quando nuovo messaggio, incrementato dal cron recovery. Se >= 5 → status failed_max_retries.';
COMMENT ON COLUMN public.whatsapp_messages.last_processing_attempt_at IS
  'P1-1: timestamp dell''ultimo tentativo di processing (webhook o recovery).';
