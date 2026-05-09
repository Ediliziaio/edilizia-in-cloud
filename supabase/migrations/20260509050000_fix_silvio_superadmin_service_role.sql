-- ═══════════════════════════════════════════════════════════════════════════
-- BUGFIX: is_silvio_superadmin ritorna false quando chiamato da service_role
-- -----------------------------------------------------------------------
-- Sintomo: Silvio in chat dice "Ho un problema: i tool mi tornano 'Permesso negato'".
--
-- Causa: i RPC silvio_* usano `IF NOT public.is_silvio_superadmin() THEN RAISE`.
-- Quando l'edge function silvio-admin-chat chiama questi RPC col service_role
-- client, `auth.uid()` ritorna NULL → is_silvio_superadmin() ritorna false →
-- i RPC sollevano eccezione "Permesso negato".
--
-- Fix: quando p_user_id è NULL E la sessione è service_role, ritorna true.
-- (L'edge function ha già verificato super_admin a monte via user_roles.)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.is_silvio_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_role BOOLEAN;
  v_session_role TEXT;
BEGIN
  -- Bypass per service_role: l'edge function ha già verificato super_admin
  -- a monte (auth.getUser + user_roles check). Qui è defense-in-depth.
  v_session_role := current_setting('role', true);
  IF p_user_id IS NULL AND v_session_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- Pattern normale: utente authenticated → check tabella user_roles
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  ) INTO v_has_role;

  RETURN COALESCE(v_has_role, false);
END;
$$;

COMMENT ON FUNCTION public.is_silvio_superadmin IS
  'Helper centralizzato per check super_admin. Bypass per service_role (edge function ha già verificato a monte).';

COMMIT;
