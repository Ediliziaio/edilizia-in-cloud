-- Lo storico di pg_cron non si ripuliva mai: 1.081.160 righe / 598 MB in
-- cron.job_run_details, col solo indice della PK. Qualsiasi domanda del tipo
-- "questo job ha girato nelle ultime 26 ore?" — la prima che fa il canarino —
-- costava uno scan da 600 MB e mandava la RPC in statement timeout.
--
-- Due settimane di storico bastano a ogni diagnosi fatta finora; il resto
-- e' zavorra. Pulizia iniziale + cron giornaliero di mantenimento.

DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days';

DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cron-history-cleanup-daily';
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  PERFORM cron.schedule(
    'cron-history-cleanup-daily',
    '40 3 * * *',
    $cmd$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days'$cmd$
  );
END $$;

-- canarino_vitali, versione veloce: il controllo "cron silenti" passa da 93
-- NOT EXISTS (93 scan della tabella) a UNA scansione delle ultime 26 ore.
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

-- Il VACUUM segna le righe morte ma il file resta grande: lo scan della
-- finestra "ultime 26 ore" continuava a leggere 598 MB di pagine vuote e
-- sforava gli 8 secondi di statement_timeout di PostgREST. L'indice rende
-- la finestra una lettura puntuale, qualunque sia la storia della tabella.
CREATE INDEX IF NOT EXISTS idx_job_run_details_start_time
  ON cron.job_run_details (start_time);
ANALYZE cron.job_run_details;
