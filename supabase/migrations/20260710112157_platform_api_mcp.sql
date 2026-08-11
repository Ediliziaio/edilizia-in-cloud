-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- API piattaforma + MCP — riattivazione infrastruttura api_keys (dormiente)
-- Chiavi a livello piattaforma (company_id NULL = tutte le aziende, super admin)
ALTER TABLE public.api_keys ALTER COLUMN company_id DROP NOT NULL;
-- Log anche per chiamate piattaforma senza azienda risolta
ALTER TABLE public.api_usage_log ALTER COLUMN company_id DROP NOT NULL;
-- Indici percorso caldo: autenticazione (hash) e rate-limit (ultimo minuto)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
  ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_key_time
  ON public.api_usage_log (api_key_id, created_at DESC);
COMMENT ON COLUMN public.api_keys.company_id IS
  'NULL = chiave a livello piattaforma (super admin, tutte le aziende); altrimenti chiave limitata alla singola azienda.';
