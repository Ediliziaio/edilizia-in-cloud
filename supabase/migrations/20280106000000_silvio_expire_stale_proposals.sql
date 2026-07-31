-- FIX coda HITL che cresce all'infinito (trovato coi test su Demo 2026-07-31):
-- le proposte ai_action_proposals restavano 'pending' PER SEMPRE anche dopo
-- expires_at (32/37 in prod erano pending-scadute; lo stato 'expired' esiste
-- nel CHECK ma nessuno lo scriveva). La UI continuava a mostrarle come da
-- approvare. Fix additivo: silvio_cleanup_old_alerts() — già schedulata dal
-- cron `silvio_cleanup_daily` — ora marca anche le proposte scadute.

CREATE OR REPLACE FUNCTION public.silvio_cleanup_old_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v1 int := 0; v2 int := 0; v3 int := 0; v4 int := 0; v5 int := 0;
BEGIN
  -- Alert aziendali (comportamento originale invariato)
  DELETE FROM public.silvio_alerts
  WHERE status IN ('resolved', 'dismissed', 'expired')
    AND COALESCE(resolved_at, updated_at) < now() - interval '30 days';
  GET DIAGNOSTICS v1 = ROW_COUNT;

  -- Admin alerts gestiti (non-open) più vecchi di 30gg
  DELETE FROM public.silvio_admin_alerts
  WHERE status <> 'open'
    AND COALESCE(acted_at, updated_at, created_at) < now() - interval '30 days';
  GET DIAGNOSTICS v2 = ROW_COUNT;

  -- Admin alerts con expires_at passata da più di 7gg
  DELETE FROM public.silvio_admin_alerts
  WHERE expires_at IS NOT NULL
    AND expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v3 = ROW_COUNT;

  -- Rete di sicurezza: admin alerts 'open' dimenticati da più di 60gg
  DELETE FROM public.silvio_admin_alerts
  WHERE status = 'open'
    AND created_at < now() - interval '60 days';
  GET DIAGNOSTICS v4 = ROW_COUNT;

  -- Proposte HITL scadute mai risolte: pending oltre expires_at → 'expired'
  -- (le righe restano come storico; smettono di apparire come "da approvare").
  -- Il trigger guard_ai_action_proposal_user_update permette l'update solo a
  -- service_role (via claim JWT) o super_admin: il cron gira come postgres
  -- SENZA claims, quindi impostiamo il claim transaction-local — la stessa
  -- identità con cui operano le edge functions. set_config(..., true) muore
  -- a fine transazione del cron.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.ai_action_proposals
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();
  GET DIAGNOSTICS v5 = ROW_COUNT;

  RETURN v1 + v2 + v3 + v4 + v5;
END;
$$;

-- Una tantum: marca subito le pendenti già scadute (stesso claim del cron).
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.ai_action_proposals
SET status = 'expired'
WHERE status = 'pending'
  AND expires_at IS NOT NULL
  AND expires_at < now();
COMMIT;
