-- Le caselle scollegate non sono piu' un elenco nel rapporto del super-admin.
--
-- Riconnettere una casella richiede il login Google/Microsoft dell'azienda:
-- il super-admin non puo' farci niente. Con due caselle si sopporta, con
-- quaranta il rapporto diventa una lista di cose non azionabili — e un
-- rapporto cosi' si smette di leggerlo. L'avviso ora va a chi ha collegato
-- la casella (system-emails-tick, job casella_scollegata).
--
-- Qui resta il CONTEGGIO, che e' informazione di salute della piattaforma, e
-- si accende un allarme vero solo quando il guasto e' NOSTRO: se sono giu'
-- tutte le caselle di un provider (o quasi), non e' che quaranta aziende
-- hanno revocato il consenso lo stesso giorno — sono le nostre credenziali
-- OAuth a essere saltate, e quello si' che e' un problema del super-admin.
CREATE OR REPLACE FUNCTION public.canarino_vitali()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'net'
AS $function$
WITH job_recenti AS (
  SELECT DISTINCT jobid
  FROM cron.job_run_details
  WHERE start_time > now() - interval '26 hours'
),
caselle AS (
  SELECT
    c.provider,
    count(*) AS totali,
    count(*) FILTER (
      WHERE (c.expires_at IS NOT NULL AND c.expires_at < now())
         OR c.consecutive_errors >= 5
    ) AS rotte
  FROM public.email_oauth_connections c
  WHERE c.poll_enabled
  GROUP BY c.provider
)
SELECT jsonb_build_object(
  'generato_alle', now(),

  'cron_silenti', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('job', j.jobname, 'schedule', j.schedule))
    FROM cron.job j
    WHERE j.active
      AND split_part(j.schedule, ' ', 3) = '*'
      AND split_part(j.schedule, ' ', 5) = '*'
      AND j.jobid NOT IN (SELECT jobid FROM job_recenti)
      AND EXISTS (
        SELECT 1 FROM public.ops_cron_visti v
        WHERE v.jobid = j.jobid AND v.primo_avvistamento < now() - interval '26 hours'
      )
  ), '[]'::jsonb),

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

  -- Guasto NOSTRO: da 3 caselle in su di uno stesso provider, tutte rotte.
  -- Sotto quella soglia sono casi singoli, gia' avvisati direttamente.
  'oauth_provider_giu', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'provider', k.provider,
      'caselle_rotte', k.rotte,
      'su_totale', k.totali,
      'sospetto', 'tutte le caselle ' || k.provider || ' sono giu'': controllare le credenziali OAuth di piattaforma'))
    FROM caselle k
    WHERE k.totali >= 3 AND k.rotte = k.totali
  ), '[]'::jsonb),

  -- Solo il numero: le singole le gestiscono le aziende.
  'caselle_scollegate_totale', COALESCE((SELECT sum(k.rotte) FROM caselle k), 0),
  'caselle_collegate_totale', COALESCE((SELECT sum(k.totali) FROM caselle k), 0),

  'integrazioni_scadute', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'integration_id', ic.integration_id, 'tipo', ic.token_type,
      'scaduta_il', ic.expires_at::date))
    FROM integration_credentials ic
    WHERE ic.expires_at IS NOT NULL AND ic.expires_at < now()
  ), '[]'::jsonb),

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

  'ricariche_esaurite', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'azienda', c.name, 'wallet', t.wallet_type,
      'motivo', left(coalesce(t.last_failure_reason,'?'), 60)))
    FROM company_auto_topup t JOIN companies c ON c.id = t.company_id
    WHERE t.retries_exhausted_at IS NOT NULL
  ), '[]'::jsonb)
);
$function$;

NOTIFY pgrst, 'reload schema';
