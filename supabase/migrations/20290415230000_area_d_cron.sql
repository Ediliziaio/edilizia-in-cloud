-- Cron dei due giri del server dell'area D (15/11/2026): subappalti-collega-fatture e
-- bollette-riconosci. Applicata dopo aver verificato che le due funzioni sono online
-- (subappalti-collega-fatture v3, bollette-riconosci v2). Ogni 15 minuti, sfasati dagli altri giri
-- al quarto d'ora; attesa di 15 secondi (le funzioni rispondono a pg_net entro 5 con
-- serveConMetricheRapida e finiscono il lavoro in background); segreto dal Vault, come per
-- bank-auto-reconcile. Il giro dei subappalti lavora solo per le aziende con l'interruttore del
-- collegamento automatico acceso; quello delle bollette legge per tutte, e il costo segue
-- l'interruttore.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subappalti-collega-fatture') THEN
    PERFORM cron.unschedule('subappalti-collega-fatture');
  END IF;
  PERFORM cron.schedule('subappalti-collega-fatture', '7,22,37,52 * * * *', $job$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/subappalti-collega-fatture',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
      ),
      body := '{}'::jsonb, timeout_milliseconds := 15000
    ) AS request_id;
  $job$);
END $$;

-- Le bollette: stesso schema, sfasato di 4 minuti dal giro dei subappalti.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bollette-riconosci') THEN
    PERFORM cron.unschedule('bollette-riconosci');
  END IF;
  PERFORM cron.schedule('bollette-riconosci', '11,26,41,56 * * * *', $job$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/bollette-riconosci',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
      ),
      body := '{}'::jsonb, timeout_milliseconds := 15000
    ) AS request_id;
  $job$);
END $$;
