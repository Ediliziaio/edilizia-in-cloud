-- Il canarino: i guasti di questa piattaforma muoiono in silenzio.
--
-- Il dunning non e' mai partito per quattro mesi, la CI e' rimasta in 401 per
-- giorni, hr-check-scadenze rispondeva 500 con il cron che diceva "succeeded",
-- il monitoraggio integrazioni non gira. Nessuno ha avvisato nessuno.
--
-- Questa funzione raccoglie i segnali vitali osservabili dal database; la
-- edge function ops-canarino la chiama ogni mattina e manda UN email al
-- super-admin. SECURITY DEFINER perche' legge cron.* e net.*, che l'API
-- non espone.

CREATE OR REPLACE FUNCTION public.canarino_vitali()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'net'
AS $function$
SELECT jsonb_build_object(
  'generato_alle', now(),

  -- Cron che dovrebbero girare almeno ogni giorno e non l'hanno fatto nelle
  -- ultime 26 ore (il margine assorbe i ritardi). Solo schedule giornalieri o
  -- piu' frequenti: giorno-del-mese e giorno-della-settimana entrambi '*'.
  'cron_silenti', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('job', j.jobname, 'schedule', j.schedule))
    FROM cron.job j
    WHERE j.active
      AND split_part(j.schedule, ' ', 3) = '*'
      AND split_part(j.schedule, ' ', 5) = '*'
      AND NOT EXISTS (
        SELECT 1 FROM cron.job_run_details d
        WHERE d.jobid = j.jobid AND d.start_time > now() - interval '26 hours'
      )
  ), '[]'::jsonb),

  -- Risposte HTTP dei cron: errori e timeout delle ultime 24 ore.
  -- "succeeded" in job_run_details non significa niente: la verita' sta qui.
  'http_errori_24h', COALESCE((
    SELECT jsonb_agg(x) FROM (
      SELECT coalesce(r.status_code::text, 'timeout') AS status,
             count(*) AS n,
             left(max(r.content), 90) AS esempio
      FROM net._http_response r
      WHERE r.created > now() - interval '24 hours'
        AND (r.status_code IS NULL OR r.status_code >= 400)
      GROUP BY 1 ORDER BY count(*) DESC LIMIT 8
    ) x
  ), '[]'::jsonb),

  -- Caselle email collegate che non funzionano piu': token scaduto o errori
  -- consecutivi. E' il caso "2 Gmail scadute da giugno e nessuno lo sapeva".
  'caselle_email_giu', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'email', c.email_address, 'provider', c.provider,
      'errori_consecutivi', c.consecutive_errors,
      'scaduta', (c.expires_at IS NOT NULL AND c.expires_at < now())))
    FROM email_oauth_connections c
    WHERE c.poll_enabled
      AND (c.consecutive_errors >= 5
           OR (c.expires_at IS NOT NULL AND c.expires_at < now()))
  ), '[]'::jsonb),

  -- Credenziali di integrazioni (Meta ecc.) scadute.
  'integrazioni_scadute', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'integration_id', ic.integration_id, 'tipo', ic.token_type,
      'scaduta_il', ic.expires_at::date))
    FROM integration_credentials ic
    WHERE ic.expires_at IS NOT NULL AND ic.expires_at < now()
  ), '[]'::jsonb),

  -- Aziende in mancato pagamento che NON stanno ricevendo solleciti:
  -- esattamente il guasto rimasto invisibile per quattro mesi.
  'dunning_fermo', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'azienda', c.name,
      'in_ritardo_da', (CURRENT_DATE - c.dunning_started_at::date)))
    FROM companies c
    WHERE c.stripe_subscription_status = 'past_due'
      AND c.dunning_started_at < now() - interval '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM dunning_attempts da
        WHERE da.company_id = c.id AND da.status = 'sent'
          AND da.created_at > now() - interval '4 days'
      )
  ), '[]'::jsonb),

  -- Ricariche automatiche con calendario esaurito: serve il cliente
  -- (nuova carta), quindi qualcuno deve chiamarlo.
  'ricariche_esaurite', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'azienda', c.name, 'wallet', t.wallet_type,
      'motivo', left(coalesce(t.last_failure_reason,'?'), 60)))
    FROM company_auto_topup t JOIN companies c ON c.id = t.company_id
    WHERE t.retries_exhausted_at IS NOT NULL
  ), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.canarino_vitali() IS
  'Segnali vitali della piattaforma per il rapporto mattutino di ops-canarino: cron silenti, errori HTTP dei cron, caselle email giu'', integrazioni scadute, solleciti fermi, ricariche esaurite.';

-- La chiama solo la edge function con la service key.
REVOKE ALL ON FUNCTION public.canarino_vitali() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
