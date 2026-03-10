
-- ============================================================
-- SECURITY FIX: signature_requests - public_read_by_token
-- ============================================================
DROP POLICY IF EXISTS "public_read_by_token" ON public.signature_requests;
CREATE POLICY "public_read_by_token" ON public.signature_requests
  FOR SELECT TO public
  USING (
    token IS NOT NULL 
    AND token = current_setting('request.header.x-signature-token', true)
  );

DROP POLICY IF EXISTS "public_update_by_token" ON public.signature_requests;
CREATE POLICY "public_update_by_token" ON public.signature_requests
  FOR UPDATE TO public
  USING (
    status = 'pending' 
    AND token IS NOT NULL
    AND token = current_setting('request.header.x-signature-token', true)
  )
  WITH CHECK (status = 'signed');

-- ============================================================
-- SECURITY FIX: staff_permissions - privilege escalation
-- Remove broad UPDATE, keep only SELECT for staff + RPC for password flag
-- ============================================================
DROP POLICY IF EXISTS "Staff can update their own password flag" ON public.staff_permissions;

CREATE OR REPLACE FUNCTION public.staff_update_own_password_flag(
  _must_change boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.staff_permissions 
  SET must_change_password = _must_change
  WHERE user_id = auth.uid();
END;
$$;

-- ============================================================
-- SECURITY FIX: quotes - anon PII exposure (UUID cast)
-- ============================================================
DROP POLICY IF EXISTS "q_anon_sel" ON public.quotes;
CREATE POLICY "q_anon_sel" ON public.quotes
  FOR SELECT TO anon
  USING (
    signature_token IS NOT NULL 
    AND status IN ('inviata', 'accettata', 'rifiutata', 'scaduta')
    AND signature_token = (current_setting('request.header.x-quote-token', true))::uuid
  );

-- ============================================================
-- SECURITY FIX: login_attempts - restrict INSERT
-- ============================================================
DROP POLICY IF EXISTS "login_attempts_insert_service" ON public.login_attempts;
CREATE POLICY "login_attempts_insert_service" ON public.login_attempts
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "login_attempts_insert_own" ON public.login_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NOT NULL 
    AND user_id = auth.uid()
  );
