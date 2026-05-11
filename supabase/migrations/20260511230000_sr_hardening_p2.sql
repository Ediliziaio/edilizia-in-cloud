-- ═══════════════════════════════════════════════════════════════════════════
-- Hardening P2 modulo Serramenti
-- ---------------------------------------------------------------------------
-- 1. Trigger automatico per audit log su ogni cambio di stato del progetto
--    (oggi gli eventi sono loggati manualmente solo dalle edge function).
-- 2. RPC sr_cleanup_expired_public_tokens: invalida public_token dei progetti
--    in stato archiviato/rifiutato/scaduto da oltre 90 giorni (esposizione zero
--    dopo cessazione del rapporto col cliente).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Trigger audit automatico su cambio stato ───────────────────────────

CREATE OR REPLACE FUNCTION public.sr_progetti_audit_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
BEGIN
  -- Logga solo se lo stato cambia davvero
  IF NEW.stato IS DISTINCT FROM OLD.stato THEN
    INSERT INTO public.sr_progetti_audit (
      progetto_id, company_id, user_id, event_type, event_data
    ) VALUES (
      NEW.id,
      NEW.company_id,
      auth.uid(),
      'state_change',
      jsonb_build_object(
        'from', OLD.stato,
        'to', NEW.stato,
        'at', now()
      )
    );
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS sr_progetti_audit_state ON public.sr_progetti;
CREATE TRIGGER sr_progetti_audit_state
  AFTER UPDATE OF stato ON public.sr_progetti
  FOR EACH ROW
  EXECUTE FUNCTION public.sr_progetti_audit_state_change();

-- ─── 2. Cleanup public_token per progetti vecchi/archiviati ────────────────

CREATE OR REPLACE FUNCTION public.sr_cleanup_expired_public_tokens()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count int;
BEGIN
  WITH expired AS (
    UPDATE public.sr_progetti
    SET public_token = NULL, public_url = NULL
    WHERE public_token IS NOT NULL
      AND stato IN ('archiviato', 'rifiutato', 'scaduto')
      AND updated_at < (now() - INTERVAL '90 days')
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.sr_cleanup_expired_public_tokens() TO service_role;

-- ─── 3. RPC sr_progetti_audit_recent: ultime N attività per debug ──────────

CREATE OR REPLACE FUNCTION public.sr_progetti_audit_recent(p_progetto_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  event_type text,
  event_data jsonb,
  user_email text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
  SELECT
    a.event_type,
    a.event_data,
    (SELECT email FROM auth.users WHERE id = a.user_id) AS user_email,
    a.created_at
  FROM public.sr_progetti_audit a
  WHERE a.progetto_id = p_progetto_id
    AND (a.company_id = public.get_my_company_id() OR public.is_super_admin())
  ORDER BY a.created_at DESC
  LIMIT p_limit;
$fn$;

GRANT EXECUTE ON FUNCTION public.sr_progetti_audit_recent(uuid, int) TO authenticated;

COMMIT;
