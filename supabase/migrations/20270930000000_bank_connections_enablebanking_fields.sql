-- ============================================================================
-- bank_connections — campi per Enable Banking (Open Banking / AIS)
-- ============================================================================
-- auth_state: lo "state" del consenso PSD2, per matchare il callback (?code=&state=)
--   con la connessione creata in start-auth.
-- provider_session_id: il session_id da POST /sessions, usato per leggere
--   accounts/transactions in fase di sync.
-- Additivo, nullable. (Già applicato in produzione via MCP.)
-- ============================================================================
ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS auth_state text,
  ADD COLUMN IF NOT EXISTS provider_session_id text;

CREATE INDEX IF NOT EXISTS idx_bank_connections_auth_state
  ON public.bank_connections(auth_state)
  WHERE auth_state IS NOT NULL;

COMMENT ON COLUMN public.bank_connections.auth_state IS 'Enable Banking: state del consenso, per matchare il callback con la connessione.';
COMMENT ON COLUMN public.bank_connections.provider_session_id IS 'Enable Banking: session_id ottenuto da POST /sessions, usato per leggere accounts/transactions.';
