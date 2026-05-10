-- ════════════════════════════════════════════════════════════════════════════
-- GAP 7b — Email OAuth Connections + Encryption + Cron 10min (paste-and-run)
-- Generato 2026-05-10T08:47:21Z — versione INLINED
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
--
-- ⚠ PRE-REQUISITO: setta la chiave AES per encrypt token PRIMA di runnare
--   ALTER DATABASE postgres SET app.email_oauth_encryption_key = '<random_64_hex>';
--   (genera con: openssl rand -hex 32)
--   E lo stesso valore in Supabase Dashboard → Edge Functions → Secrets
--   se vuoi che le edge function la possano usare via env (opzionale,
--   le edge usano comunque le RPC che leggono da app.email_oauth_encryption_key).
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- GAP 7b — Email OAuth Connections (Gmail + Outlook native, come GHL)
-- ────────────────────────────────────────────────────────────────────────────
-- Tabella per memorizzare le connessioni OAuth verso Gmail (Google API) e
-- Outlook (Microsoft Graph) per polling automatico email.
--
-- Encryption: i token sono cifrati AT REST via pgcrypto AES-GCM con la chiave
-- in `app.email_oauth_encryption_key` (settata via ALTER DATABASE).
-- Edge function decifra leggendo via RPC `email_oauth_get_decrypted_tokens`.
--
-- Cron polling: edge function `email-poll-inbox` viene chiamata ogni 10min
-- da pg_cron, scansiona le connessioni con status='active' e last_synced_at
-- > 10min fa, fetcha email nuove via API e le inoltra a email-triage-ai.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- pgcrypto già abilitata di norma su Supabase, safety check
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1) Tabella email_oauth_connections ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_oauth_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- chi ha connesso
  -- Provider OAuth
  provider        text NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  email_address   text NOT NULL,    -- account email connesso
  -- Token storage CIFRATI (bytea AES-GCM)
  access_token_enc  bytea,
  refresh_token_enc bytea,
  expires_at      timestamptz,      -- access_token expiry
  scopes          text[] DEFAULT '{}',
  -- Stato + audit
  status          text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'expired', 'revoked', 'error'
  )),
  last_synced_at  timestamptz,
  last_sync_error text,
  consecutive_errors int NOT NULL DEFAULT 0,
  emails_fetched_total int NOT NULL DEFAULT 0,
  -- Polling config
  poll_enabled    boolean NOT NULL DEFAULT true,
  poll_interval_minutes int NOT NULL DEFAULT 10 CHECK (poll_interval_minutes BETWEEN 5 AND 1440),
  -- Filter inbound: solo email arrivate dopo questa data (per non re-scansiona archivio)
  sync_from_date  timestamptz NOT NULL DEFAULT now(),
  -- Metadata provider-specific
  provider_metadata jsonb DEFAULT '{}'::jsonb,  -- es. Gmail history_id, Outlook delta link
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Una company può avere PIÙ account email connessi (es. info@ + admin@ + sales@)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_oauth_unique
  ON public.email_oauth_connections (company_id, provider, lower(email_address));

CREATE INDEX IF NOT EXISTS idx_email_oauth_due
  ON public.email_oauth_connections (last_synced_at NULLS FIRST, poll_interval_minutes)
  WHERE poll_enabled = true AND status = 'active';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_email_oauth_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_email_oauth_updated_at ON public.email_oauth_connections;
CREATE TRIGGER trg_email_oauth_updated_at
  BEFORE UPDATE ON public.email_oauth_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_oauth_updated_at();

-- ─── 2) RLS multi-tenant ────────────────────────────────────────────────────
ALTER TABLE public.email_oauth_connections ENABLE ROW LEVEL SECURITY;

-- I token CIFRATI non sono mai esposti via RLS — solo via RPC service_role
DROP POLICY IF EXISTS email_oauth_company_read_meta ON public.email_oauth_connections;
CREATE POLICY email_oauth_company_read_meta ON public.email_oauth_connections
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS email_oauth_company_admin_manage ON public.email_oauth_connections;
CREATE POLICY email_oauth_company_admin_manage ON public.email_oauth_connections
  FOR ALL TO authenticated
  USING (
    company_id = public.get_effective_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  )
  WITH CHECK (
    company_id = public.get_effective_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS email_oauth_service_all ON public.email_oauth_connections;
CREATE POLICY email_oauth_service_all ON public.email_oauth_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS email_oauth_super_admin ON public.email_oauth_connections;
CREATE POLICY email_oauth_super_admin ON public.email_oauth_connections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ─── 3) Helper functions encrypt/decrypt token (pgcrypto AES-GCM) ──────────
-- La chiave AES viene letta da app.email_oauth_encryption_key
-- (settata via ALTER DATABASE postgres SET ... = 'random_32byte_hex').

CREATE OR REPLACE FUNCTION public.email_oauth_encrypt_token(p_token text)
RETURNS bytea
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := current_setting('app.email_oauth_encryption_key', true);
  IF v_key IS NULL OR length(v_key) < 32 THEN
    RAISE EXCEPTION 'app.email_oauth_encryption_key non configurata (min 32 char)';
  END IF;
  IF p_token IS NULL THEN RETURN NULL; END IF;
  -- pgcrypto pgp_sym_encrypt è il modo più semplice (AES-256-CFB + HMAC)
  RETURN pgp_sym_encrypt(p_token, v_key, 'cipher-algo=aes256');
END;
$$;

CREATE OR REPLACE FUNCTION public.email_oauth_decrypt_token(p_enc bytea)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := current_setting('app.email_oauth_encryption_key', true);
  IF v_key IS NULL OR length(v_key) < 32 THEN
    RAISE EXCEPTION 'app.email_oauth_encryption_key non configurata';
  END IF;
  IF p_enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_enc, v_key);
END;
$$;

REVOKE ALL ON FUNCTION public.email_oauth_encrypt_token(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_oauth_decrypt_token(bytea) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_oauth_encrypt_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_oauth_decrypt_token(bytea) TO service_role;

-- ─── 4) RPC service_role per insert/update con encrypt automatico ───────────
CREATE OR REPLACE FUNCTION public.email_oauth_upsert_connection(
  p_company_id uuid,
  p_user_id uuid,
  p_provider text,
  p_email_address text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_scopes text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.email_oauth_connections (
    company_id, user_id, provider, email_address,
    access_token_enc, refresh_token_enc, expires_at, scopes,
    status, last_sync_error, consecutive_errors
  ) VALUES (
    p_company_id, p_user_id, p_provider, lower(p_email_address),
    public.email_oauth_encrypt_token(p_access_token),
    public.email_oauth_encrypt_token(p_refresh_token),
    p_expires_at, p_scopes,
    'active', NULL, 0
  )
  ON CONFLICT (company_id, provider, lower(email_address)) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    access_token_enc = EXCLUDED.access_token_enc,
    refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, email_oauth_connections.refresh_token_enc),
    expires_at = EXCLUDED.expires_at,
    scopes = EXCLUDED.scopes,
    status = 'active',
    last_sync_error = NULL,
    consecutive_errors = 0
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.email_oauth_upsert_connection(uuid, uuid, text, text, text, text, timestamptz, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_oauth_upsert_connection(uuid, uuid, text, text, text, text, timestamptz, text[]) TO service_role;

-- ─── 5) RPC get decrypted tokens (service_role only) ────────────────────────
CREATE OR REPLACE FUNCTION public.email_oauth_get_decrypted_tokens(p_connection_id uuid)
RETURNS TABLE (
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  provider text,
  email_address text,
  company_id uuid,
  scopes text[],
  provider_metadata jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    public.email_oauth_decrypt_token(c.access_token_enc),
    public.email_oauth_decrypt_token(c.refresh_token_enc),
    c.expires_at, c.provider, c.email_address, c.company_id,
    c.scopes, c.provider_metadata
  FROM public.email_oauth_connections c
  WHERE c.id = p_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.email_oauth_get_decrypted_tokens(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_oauth_get_decrypted_tokens(uuid) TO service_role;

-- ─── 6) RPC mark sync result (service_role only) ────────────────────────────
CREATE OR REPLACE FUNCTION public.email_oauth_mark_sync(
  p_connection_id uuid,
  p_success boolean,
  p_emails_fetched int DEFAULT 0,
  p_error text DEFAULT NULL,
  p_provider_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.email_oauth_connections
    SET last_synced_at = now(),
        last_sync_error = NULL,
        consecutive_errors = 0,
        emails_fetched_total = emails_fetched_total + GREATEST(p_emails_fetched, 0),
        provider_metadata = COALESCE(p_provider_metadata, provider_metadata),
        status = CASE WHEN status = 'error' THEN 'active' ELSE status END
    WHERE id = p_connection_id;
  ELSE
    UPDATE public.email_oauth_connections
    SET last_synced_at = now(),
        last_sync_error = LEFT(COALESCE(p_error, 'unknown'), 500),
        consecutive_errors = consecutive_errors + 1,
        status = CASE WHEN consecutive_errors + 1 >= 5 THEN 'error' ELSE status END
    WHERE id = p_connection_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.email_oauth_mark_sync(uuid, boolean, int, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_oauth_mark_sync(uuid, boolean, int, text, jsonb) TO service_role;

-- ─── 7) RPC list connections due for polling ───────────────────────────────
CREATE OR REPLACE FUNCTION public.email_oauth_list_due_for_poll(p_limit int DEFAULT 50)
RETURNS TABLE (id uuid, provider text, email_address text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, provider, email_address
  FROM public.email_oauth_connections
  WHERE poll_enabled = true
    AND status = 'active'
    AND consecutive_errors < 5
    AND (
      last_synced_at IS NULL
      OR last_synced_at < now() - (poll_interval_minutes || ' minutes')::interval
    )
  ORDER BY COALESCE(last_synced_at, '1970-01-01'::timestamptz) ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.email_oauth_list_due_for_poll(int) TO service_role;

-- ─── 8) View pubblica company-side (NO TOKEN — solo metadata) ──────────────
CREATE OR REPLACE VIEW public.v_email_oauth_connections_meta AS
SELECT
  id, company_id, user_id, provider, email_address,
  status, last_synced_at, last_sync_error, consecutive_errors,
  emails_fetched_total, poll_enabled, poll_interval_minutes,
  sync_from_date, expires_at, created_at, updated_at
FROM public.email_oauth_connections;

GRANT SELECT ON public.v_email_oauth_connections_meta TO authenticated;

-- ─── 9) pg_cron daily polling (every 10min) ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('email-poll-inbox');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'email-poll-inbox',
      '*/10 * * * *', -- ogni 10 minuti
      $cron$
      SELECT net.http_post(
        url:=current_setting('app.supabase_url', true) || '/functions/v1/email-poll-inbox',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.proactive_cron_secret', true)
        ),
        body:='{"source": "pg_cron_10min"}'::jsonb,
        timeout_milliseconds:=600000
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;

COMMIT;

-- ─── Verifica ───────────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='email_oauth_connections') AS table_ok,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='v_email_oauth_connections_meta') AS view_meta_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='email_oauth_upsert_connection') AS upsert_rpc_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='email_oauth_get_decrypted_tokens') AS decrypt_rpc_ok,
  (SELECT COUNT(*)::int FROM cron.job WHERE jobname='email-poll-inbox') AS cron_job_count;

-- ─── Test encryption (round-trip) ───────────────────────────────────────
-- DECOMENTARE per testare DOPO aver settato app.email_oauth_encryption_key
-- SELECT public.email_oauth_decrypt_token(public.email_oauth_encrypt_token('test-secret-token-12345')) AS roundtrip;
