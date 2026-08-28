-- compute-health-scores e' scritta, deployata e corretta, ma non la chiamava
-- nessuno: company_health_scores era vuota da sempre, e il pannello "aziende
-- a rischio" della dashboard non ha mai avuto una riga da mostrare.
--
-- Ogni notte alle 03:40 UTC, prima dello snapshot MRR delle 04:20.
DO $$
DECLARE v bigint;
BEGIN
  SELECT jobid INTO v FROM cron.job WHERE jobname = 'compute-health-scores-daily';
  IF v IS NOT NULL THEN PERFORM cron.unschedule(v); END IF;
  PERFORM cron.schedule('compute-health-scores-daily', '40 3 * * *', $cmd$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/compute-health-scores',
      headers := jsonb_build_object('Content-Type','application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name='silvio_internal_cron_secret' LIMIT 1)),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $cmd$);
END $$;

-- Nasce "gia' noto" allo Stato piattaforma, che altrimenti lo segnalerebbe
-- come cron silente prima del suo primo giro.
INSERT INTO public.ops_cron_visti (jobid, jobname)
SELECT jobid, jobname FROM cron.job WHERE jobname = 'compute-health-scores-daily'
ON CONFLICT (jobid) DO NOTHING;
