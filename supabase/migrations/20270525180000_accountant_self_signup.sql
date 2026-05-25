-- Accountant self-signup support: rate-limit table + helper RPCs
-- Permette ai commercialisti di registrarsi direttamente dal portale
-- (commercialista.ediliziaincloud.com/commercialista-login) senza dover
-- essere invitati da un super admin.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Rate-limit table: traccia tentativi di signup per IP+email
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accountant_signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  email text,
  user_agent text,
  success boolean NOT NULL DEFAULT false,
  error_reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accountant_signup_attempts_ip_time
  ON public.accountant_signup_attempts (ip_address, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_accountant_signup_attempts_email_time
  ON public.accountant_signup_attempts (email, attempted_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RLS: solo service_role (l'edge function la usa)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.accountant_signup_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_access" ON public.accountant_signup_attempts;
CREATE POLICY "service_role_all_access"
  ON public.accountant_signup_attempts
  FOR ALL
  USING (current_setting('role'::text, true) = 'service_role'::text)
  WITH CHECK (current_setting('role'::text, true) = 'service_role'::text);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Helper RPC: rate-limit check per IP
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_accountant_signup_rate_limit(
  p_ip_address text,
  p_max_attempts integer DEFAULT 3,
  p_window_minutes integer DEFAULT 1440
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.accountant_signup_attempts
  WHERE ip_address = p_ip_address
    AND attempted_at > (now() - (p_window_minutes || ' minutes')::interval);

  RETURN v_count < p_max_attempts;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Log RPC: registra il tentativo
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_accountant_signup_attempt(
  p_ip_address text,
  p_email text,
  p_user_agent text,
  p_success boolean,
  p_error_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.accountant_signup_attempts (
    ip_address, email, user_agent, success, error_reason
  ) VALUES (
    COALESCE(p_ip_address, 'unknown'),
    lower(trim(p_email)),
    p_user_agent,
    p_success,
    p_error_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Cleanup vecchi tentativi (>30 giorni)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_accountant_signup_attempts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.accountant_signup_attempts
  WHERE attempted_at < (now() - interval '30 days');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
