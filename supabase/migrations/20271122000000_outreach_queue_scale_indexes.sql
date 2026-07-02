-- Indici per l'outreach ad alto volume (1000+ email/giorno).
-- La coda cresce di ~30k righe/mese: senza questi, le query calde vanno in seq scan.
-- Tutti IF NOT EXISTS → idempotenti (applicabili via MCP in pubblicazione).

-- Reaper del dispatcher: recupera le righe rimaste 'sending' oltre 15 min
-- (WHERE status='sending' AND updated_at < …). Indice parziale mirato.
CREATE INDEX IF NOT EXISTS idx_outreach_queue_sending_stuck
  ON public.outreach_send_queue (updated_at)
  WHERE status = 'sending';

-- Stop-on-reply / cancellazione coda per iscrizione (reply-handler, bounce inbound)
-- e computeActivity del dispatcher: lookup per enrollment_id + status.
CREATE INDEX IF NOT EXISTS idx_outreach_queue_enrollment_status
  ON public.outreach_send_queue (enrollment_id, status)
  WHERE enrollment_id IS NOT NULL;

-- Correlazione bounce/DSN per destinatario (inbound + IMAP poll): match su email
-- normalizzata. Indice funzionale su lower(to_email) per l'uguaglianza case-insensitive.
CREATE INDEX IF NOT EXISTS idx_outreach_queue_to_email_lower
  ON public.outreach_send_queue (lower(to_email))
  WHERE to_email IS NOT NULL;
