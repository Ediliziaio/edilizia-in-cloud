-- ═══════════════════════════════════════════════════════════════════════════
-- API piattaforma + MCP — riattivazione infrastruttura api_keys (dormiente)
--
-- La tabella api_keys esiste già (hash SHA-256, scopes, rate limit, RLS con
-- super_admin) ma non è mai stata usata: 0 righe, nessuna UI, nessuna API di
-- azioni. Questo intervento la rende utilizzabile ANCHE a livello piattaforma
-- (company_id NULL = chiave super admin valida su tutte le aziende) e aggiunge
-- gli indici per il percorso caldo di autenticazione (lookup per key_hash) e
-- di rate-limiting (log per chiave/minuto). Tutto additivo, zero impatti su
-- flussi esistenti.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Chiavi a livello piattaforma: company_id NULL = tutte le aziende.
--    La policy RLS esistente resta valida: i company admin vedono solo le
--    proprie (company_id IN ...), il super_admin passa dal ramo has_role e
--    gestisce anche le chiavi piattaforma.
ALTER TABLE public.api_keys ALTER COLUMN company_id DROP NOT NULL;

-- 2. I log di utilizzo devono poter registrare chiamate piattaforma senza
--    azienda risolta (es. lista_aziende).
ALTER TABLE public.api_usage_log ALTER COLUMN company_id DROP NOT NULL;

-- 3. Indici percorso caldo: autenticazione (hash) e rate-limit (ultimo minuto).
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
  ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_key_time
  ON public.api_usage_log (api_key_id, created_at DESC);

COMMENT ON COLUMN public.api_keys.company_id IS
  'NULL = chiave a livello piattaforma (super admin, tutte le aziende); altrimenti chiave limitata alla singola azienda.';
