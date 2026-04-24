-- Webhook hardening: IP whitelist, timeout configurabile, circuit breaker
-- ---------------------------------------------------------------------
-- Aggiunge colonne al webhook per migliorare sicurezza e resilienza:
-- - allowed_ips: lista CIDR (opzionale) — se non vuota, le delivery arrivano
--   sol se l'IP del caller è nella whitelist (controllo in edge function)
-- - timeout_seconds: timeout configurabile per la POST (default 15s)
-- - consecutive_failures: counter server-side per circuit breaker
-- - paused_at: quando il circuit breaker ha messo in pausa automatica il webhook
-- - max_consecutive_failures: soglia oltre la quale disattivare (default 20)

BEGIN;

ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS allowed_ips TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS timeout_seconds INT DEFAULT 15 CHECK (timeout_seconds BETWEEN 3 AND 60),
  ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0 CHECK (consecutive_failures >= 0),
  ADD COLUMN IF NOT EXISTS max_consecutive_failures INT DEFAULT 20 CHECK (max_consecutive_failures BETWEEN 5 AND 100),
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_reason TEXT;

COMMENT ON COLUMN public.webhooks.allowed_ips IS 'IP/CIDR whitelist. Se vuoto, nessuna restrizione IP';
COMMENT ON COLUMN public.webhooks.timeout_seconds IS 'Timeout HTTP per chiamata endpoint (secondi)';
COMMENT ON COLUMN public.webhooks.consecutive_failures IS 'Contatore fallimenti consecutivi (reset a 0 al primo success)';
COMMENT ON COLUMN public.webhooks.max_consecutive_failures IS 'Soglia oltre la quale il webhook viene auto-disabilitato';
COMMENT ON COLUMN public.webhooks.paused_at IS 'Quando il circuit breaker ha sospeso il webhook';
COMMENT ON COLUMN public.webhooks.paused_reason IS 'Motivo della sospensione (es. too_many_failures)';

-- Index per circuit breaker queries
CREATE INDEX IF NOT EXISTS idx_webhooks_consec_failures
  ON public.webhooks(company_id, consecutive_failures)
  WHERE consecutive_failures > 0;

COMMIT;
