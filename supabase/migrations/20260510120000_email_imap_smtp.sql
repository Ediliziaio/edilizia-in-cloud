-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT E4 — IMAP/SMTP custom provider support
-- ---------------------------------------------------------------------------
-- Estende email_oauth_connections per supportare provider 'imap' (host
-- custom Aruba, Libero, Yahoo, Register, iCloud, ecc.) oltre a Gmail/Outlook.
--
-- Token table fields nuovi:
--   imap_host, imap_port (993), imap_secure (true)
--   smtp_host, smtp_port (587), smtp_secure (true)
--   imap_username (di solito = email_address ma non sempre)
--   password_enc (cifrato come access_token_enc, riusa pgsodium key)
--
-- Per gli account OAuth (gmail/outlook) questi campi restano NULL.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Allarga il check vincolo provider
ALTER TABLE public.email_oauth_connections
  DROP CONSTRAINT IF EXISTS email_oauth_connections_provider_check;
ALTER TABLE public.email_oauth_connections
  ADD CONSTRAINT email_oauth_connections_provider_check
  CHECK (provider IN ('gmail', 'outlook', 'imap'));

-- 2) Aggiungi campi IMAP/SMTP
ALTER TABLE public.email_oauth_connections
  ADD COLUMN IF NOT EXISTS imap_host        TEXT,
  ADD COLUMN IF NOT EXISTS imap_port        INT DEFAULT 993,
  ADD COLUMN IF NOT EXISTS imap_secure      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS imap_username    TEXT,
  ADD COLUMN IF NOT EXISTS smtp_host        TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port        INT DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_secure      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_enc     BYTEA,        -- per IMAP login + SMTP auth
  ADD COLUMN IF NOT EXISTS provider_label   TEXT,         -- es. 'aruba', 'libero', 'icloud', 'custom'
  ADD COLUMN IF NOT EXISTS last_test_ok     BOOLEAN,
  ADD COLUMN IF NOT EXISTS last_test_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_error  TEXT;

-- Per provider IMAP, refresh_token_enc/access_token_enc restano NULL.
-- access_token_enc è gestito da pgsodium; password_enc usa lo stesso pattern.

-- 3) Vista UI estesa per esporre i campi IMAP non sensibili
CREATE OR REPLACE VIEW public.v_email_oauth_connections_meta AS
SELECT
  c.id,
  c.company_id,
  c.user_id,
  c.provider,
  c.email_address,
  c.status,
  c.last_synced_at,
  c.last_sync_error,
  c.consecutive_errors,
  c.emails_fetched_total,
  c.poll_enabled,
  c.poll_interval_minutes,
  c.sync_from_date,
  c.expires_at,
  c.created_at,
  c.updated_at,
  c.imap_host,
  c.imap_port,
  c.imap_secure,
  c.imap_username,
  c.smtp_host,
  c.smtp_port,
  c.smtp_secure,
  c.provider_label,
  c.last_test_ok,
  c.last_test_at,
  c.last_test_error,
  -- password mascherata: presente sì/no, mai contenuto
  CASE WHEN c.password_enc IS NOT NULL THEN '••••••••' ELSE NULL END AS password_masked
FROM public.email_oauth_connections c;

GRANT SELECT ON public.v_email_oauth_connections_meta TO authenticated;

-- 4) RPC email_imap_upsert_connection — INSERT/UPDATE connessione IMAP custom
CREATE OR REPLACE FUNCTION public.email_imap_upsert_connection(
  p_email_address    TEXT,
  p_imap_host        TEXT,
  p_imap_port        INT,
  p_imap_secure      BOOLEAN,
  p_imap_username    TEXT,
  p_smtp_host        TEXT,
  p_smtp_port        INT,
  p_smtp_secure      BOOLEAN,
  p_password         TEXT,
  p_provider_label   TEXT DEFAULT 'custom',
  p_existing_id      UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Profilo senza azienda' USING ERRCODE = '42501';
  END IF;

  IF p_existing_id IS NOT NULL THEN
    UPDATE public.email_oauth_connections
    SET
      email_address    = p_email_address,
      imap_host        = p_imap_host,
      imap_port        = p_imap_port,
      imap_secure      = p_imap_secure,
      imap_username    = COALESCE(p_imap_username, p_email_address),
      smtp_host        = p_smtp_host,
      smtp_port        = p_smtp_port,
      smtp_secure      = p_smtp_secure,
      password_enc     = CASE
        WHEN p_password IS NOT NULL AND length(p_password) > 0
        THEN pgsodium.crypto_secretbox(
          convert_to(p_password, 'UTF8'),
          decode(repeat('00', 24), 'hex'),
          (SELECT key_id FROM pgsodium.valid_key WHERE name = 'default' LIMIT 1)
        )
        ELSE password_enc
      END,
      provider_label   = COALESCE(p_provider_label, provider_label),
      status           = 'active',
      updated_at       = now()
    WHERE id = p_existing_id AND user_id = v_user_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.email_oauth_connections (
      company_id, user_id, provider, email_address,
      imap_host, imap_port, imap_secure, imap_username,
      smtp_host, smtp_port, smtp_secure,
      password_enc, provider_label, status, scopes
    )
    VALUES (
      v_company_id, v_user_id, 'imap', p_email_address,
      p_imap_host, p_imap_port, p_imap_secure, COALESCE(p_imap_username, p_email_address),
      p_smtp_host, p_smtp_port, p_smtp_secure,
      pgsodium.crypto_secretbox(
        convert_to(p_password, 'UTF8'),
        decode(repeat('00', 24), 'hex'),
        (SELECT key_id FROM pgsodium.valid_key WHERE name = 'default' LIMIT 1)
      ),
      COALESCE(p_provider_label, 'custom'),
      'active',
      '{}'::text[]
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_imap_upsert_connection(
  TEXT, TEXT, INT, BOOLEAN, TEXT, TEXT, INT, BOOLEAN, TEXT, TEXT, UUID
) TO authenticated;

-- 5) RPC email_imap_get_credentials — usato da edge per decifrare password
-- (analogo a email_oauth_get_decrypted_tokens)
CREATE OR REPLACE FUNCTION public.email_imap_get_credentials(p_connection_id UUID)
RETURNS TABLE(
  email_address TEXT,
  imap_host TEXT, imap_port INT, imap_secure BOOLEAN, imap_username TEXT,
  smtp_host TEXT, smtp_port INT, smtp_secure BOOLEAN,
  password TEXT, company_id UUID, user_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
BEGIN
  -- Solo service_role può chiamare questa RPC: l'edge function decifra.
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.email_address,
    c.imap_host, c.imap_port, c.imap_secure, c.imap_username,
    c.smtp_host, c.smtp_port, c.smtp_secure,
    convert_from(
      pgsodium.crypto_secretbox_open(
        c.password_enc,
        decode(repeat('00', 24), 'hex'),
        (SELECT pgsodium.valid_key.key_id FROM pgsodium.valid_key WHERE pgsodium.valid_key.name = 'default' LIMIT 1)
      ),
      'UTF8'
    ),
    c.company_id, c.user_id
  FROM public.email_oauth_connections c
  WHERE c.id = p_connection_id
    AND c.provider = 'imap'
    AND c.password_enc IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_imap_get_credentials(UUID) TO service_role;

-- 6) RPC test_connection_result — registra risultato test
CREATE OR REPLACE FUNCTION public.email_imap_record_test(
  p_connection_id UUID,
  p_ok            BOOLEAN,
  p_error         TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_oauth_connections
  SET
    last_test_ok    = p_ok,
    last_test_at    = now(),
    last_test_error = p_error,
    status          = CASE WHEN p_ok THEN 'active' ELSE 'error' END
  WHERE id = p_connection_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_imap_record_test(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

COMMIT;
