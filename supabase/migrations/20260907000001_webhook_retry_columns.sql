-- IMP-5: Webhook auto-retry scheduler
-- Aggiunge colonne per gestione retry automatico su webhook_logs

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS max_retries   int          NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error    text;

-- Espande il vincolo status per includere 'exhausted' (tutti i retry esauriti)
ALTER TABLE public.webhook_logs
  DROP CONSTRAINT IF EXISTS webhook_logs_status_check;

ALTER TABLE public.webhook_logs
  ADD CONSTRAINT webhook_logs_status_check
    CHECK (status IN ('received','processed','failed','retried','exhausted'));

-- Indice per la coda retry (job veloce)
CREATE INDEX IF NOT EXISTS webhook_logs_retry_queue_idx
  ON public.webhook_logs (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;
