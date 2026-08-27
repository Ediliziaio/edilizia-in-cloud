-- Il canarino segnalava se stesso.
--
-- I cron creati oggi (ops-canarino-daily, ops-canarino-snapshot,
-- cron-history-cleanup-daily, sync-stripe-mrr-daily) risultavano "silenti da
-- 26 ore" solo perche' erano nati DOPO il loro orario schedulato e il primo
-- giro sarebbe stato domani. Un cron appena creato non e' un cron rotto — e
-- un allarme che grida al lupo e' un allarme che si smette di leggere.
--
-- cron.job non ha un created_at, quindi il primo avvistamento me lo segno io:
-- il job che raccoglie i vitali aggiorna il registro prima di fotografare.

CREATE TABLE IF NOT EXISTS public.ops_cron_visti (
  jobid bigint PRIMARY KEY,
  jobname text NOT NULL,
  primo_avvistamento timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_cron_visti ENABLE ROW LEVEL SECURITY;
-- Ci scrive e legge solo il motore (service_role / SECURITY DEFINER).

-- Backfill: tutti i job che esistono ADESSO sono "gia' noti", cosi' solo i
-- job creati da qui in avanti hanno il periodo di grazia.
INSERT INTO public.ops_cron_visti (jobid, jobname)
SELECT jobid, jobname FROM cron.job
ON CONFLICT (jobid) DO NOTHING;

-- Raccolta: aggiorna il registro dei job visti, poi scrive lo snapshot.
CREATE OR REPLACE FUNCTION public.ops_canarino_raccogli()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
BEGIN
  INSERT INTO public.ops_cron_visti (jobid, jobname)
  SELECT j.jobid, j.jobname FROM cron.job j
  ON CONFLICT (jobid) DO UPDATE SET jobname = EXCLUDED.jobname;

  -- I job spariti non devono restare nel registro a sporcarlo.
  DELETE FROM public.ops_cron_visti v
  WHERE NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobid = v.jobid);

  INSERT INTO public.ops_canarino_snapshot (id, vitali, generato_alle)
  VALUES (1, public.canarino_vitali(), now())
  ON CONFLICT (id) DO UPDATE
    SET vitali = EXCLUDED.vitali, generato_alle = EXCLUDED.generato_alle;
END;
$function$;

-- canarino_vitali: un job e' "silente" solo se lo conosciamo da almeno 26 ore.
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
      -- Periodo di grazia: un job appena creato non ha ancora avuto il suo
      -- primo slot. Se non lo conosciamo da almeno 26 ore, si tace.
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

-- Il cron della raccolta ora chiama la funzione che fa entrambe le cose.
DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'ops-canarino-snapshot';
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  PERFORM cron.schedule(
    'ops-canarino-snapshot',
    '50 4 * * *',
    $cmd$SELECT public.ops_canarino_raccogli()$cmd$
  );
END $$;

NOTIFY pgrst, 'reload schema';
