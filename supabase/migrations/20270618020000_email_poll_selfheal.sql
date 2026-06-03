-- ============================================================================
-- email_poll_selfheal — il cron di polling recupera da solo le caselle in 'error'.
--
-- PROBLEMA: email_oauth_list_due_for_poll() selezionava solo status='active'
-- (con consecutive_errors < 5). Quando una connessione accumulava 5 errori
-- consecutivi → status='error' → il cron non la riprocessava MAI più (deadlock).
-- Le email smettevano di aggiornarsi finché l'utente non riconnetteva l'account.
-- (Lato sync manuale il fix è in email-poll-inbox/index.ts: include 'error'.)
--
-- FIX: includere anche le connessioni 'error', ma con un backoff più lungo
-- (60 min) per recuperare dagli errori TRANSITORI (rete, 429, 5xx) senza
-- martellare i token realmente revocati. Al primo sync riuscito, mark_sync
-- riporta automaticamente status='active' e azzera consecutive_errors.
--
-- NON inclusi 'expired'/'revoked' → richiedono riconnessione OAuth dell'utente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.email_oauth_list_due_for_poll(p_limit int DEFAULT 50)
RETURNS TABLE (id uuid, provider text, email_address text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, provider, email_address
  FROM public.email_oauth_connections
  WHERE poll_enabled = true
    AND status IN ('active', 'error')
    AND (
      -- Connessioni sane: cadenza normale (poll_interval_minutes).
      (status = 'active' AND (
        last_synced_at IS NULL
        OR last_synced_at < now() - (poll_interval_minutes || ' minutes')::interval
      ))
      OR
      -- Connessioni in errore: ritenta ogni 60 min per auto-recupero (self-heal).
      (status = 'error' AND (
        last_synced_at IS NULL
        OR last_synced_at < now() - interval '60 minutes'
      ))
    )
  ORDER BY COALESCE(last_synced_at, '1970-01-01'::timestamptz) ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.email_oauth_list_due_for_poll(int) TO service_role;
