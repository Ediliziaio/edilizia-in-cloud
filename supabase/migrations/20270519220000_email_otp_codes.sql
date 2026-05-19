-- ============================================================================
-- v8.6.98 — Email OTP codes (login senza password, 6 cifre, TTL 15min)
-- ============================================================================

-- ─── Tabella codici OTP ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_otp_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,                 -- hash bcrypt-style del codice 6 cifre
  expires_at   TIMESTAMPTZ NOT NULL,          -- now() + 15 min
  consumed_at  TIMESTAMPTZ,                   -- NULL = non ancora usato
  attempts     INTEGER NOT NULL DEFAULT 0,    -- protezione brute-force
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_lookup
  ON public.email_otp_codes (email, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_otp_cleanup
  ON public.email_otp_codes (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.email_otp_codes ENABLE ROW LEVEL SECURITY;

-- ─── RLS: SOLO service_role ─────────────────────────────────────────────────
-- Nessun client può MAI leggere/scrivere. Solo le edge function
-- `email-otp-send` e `email-otp-verify` (service_role bypassa RLS).
DROP POLICY IF EXISTS "otp_no_client_access" ON public.email_otp_codes;
CREATE POLICY "otp_no_client_access"
  ON public.email_otp_codes
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- ─── Pulizia automatica codici scaduti ─────────────────────────────────────
-- Cron giornaliero: elimina codici scaduti da più di 24h
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'email_otp_cleanup';
    PERFORM cron.schedule(
      'email_otp_cleanup',
      '0 3 * * *',
      $cron$
        DELETE FROM public.email_otp_codes
        WHERE expires_at < (now() - interval '24 hours');
      $cron$
    );
  END IF;
END $$;

-- ─── RPC per verifica con rate-limit (richiesta da edge function verify) ───
-- Atomica: lookup codice + check rate-limit + check expired + check attempts.
CREATE OR REPLACE FUNCTION public.consume_email_otp(
  p_email   TEXT,
  p_code    TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
DECLARE
  v_row RECORD;
  v_match BOOLEAN;
BEGIN
  -- Trova il codice più recente non consumato per quella email
  SELECT * INTO v_row
  FROM public.email_otp_codes
  WHERE email = lower(trim(p_email))
    AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_active_code');
  END IF;

  -- Check expired
  IF v_row.expires_at < now() THEN
    UPDATE public.email_otp_codes
       SET consumed_at = now()
     WHERE id = v_row.id;
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  -- Rate-limit attempts
  IF v_row.attempts >= 5 THEN
    UPDATE public.email_otp_codes
       SET consumed_at = now()
     WHERE id = v_row.id;
    RETURN jsonb_build_object('status', 'too_many_attempts');
  END IF;

  -- Verifica hash (bcrypt-style via crypt())
  v_match := (v_row.code_hash = extensions.crypt(p_code, v_row.code_hash));

  IF NOT v_match THEN
    UPDATE public.email_otp_codes
       SET attempts = attempts + 1
     WHERE id = v_row.id;
    RETURN jsonb_build_object(
      'status', 'invalid_code',
      'attempts_left', 5 - (v_row.attempts + 1)
    );
  END IF;

  -- Successo: marca consumed
  UPDATE public.email_otp_codes
     SET consumed_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_email_otp(TEXT, TEXT) TO service_role;

-- ─── pgcrypto extension ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── Helper RPC chiamabili da edge function ───────────────────────────────
-- hash_otp_code: hash bcrypt-style del codice (gen_salt + crypt)
CREATE OR REPLACE FUNCTION public.hash_otp_code(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
BEGIN
  RETURN extensions.crypt(p_code, extensions.gen_salt('bf', 8));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hash_otp_code(TEXT) TO service_role;
