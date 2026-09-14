-- Conversioni CRM verso Meta (CAPI): il job che lavora la coda non esisteva.
--
-- meta_crm_conversion_events si riempiva da giugno 2026 (1.969 eventi in
-- attesa a settembre) ma nessun cron chiamava meta-crm-conversion-sync.
-- La funzione ora lavora solo le aziende con un pixel attivo e il token CAPI,
-- si ferma dopo 5 tentativi e scarta gli eventi più vecchi di 7 giorni
-- (Meta li rifiuta): acceso ogni 10 minuti costa una query quando non c'è
-- niente da fare.
--
-- La chiave si legge dal Vault (cron_secret), mai scritta nel job.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-crm-conversion-sync-10min') THEN
    PERFORM cron.unschedule('meta-crm-conversion-sync-10min');
  END IF;

  PERFORM cron.schedule(
    'meta-crm-conversion-sync-10min',
    '*/10 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/meta-crm-conversion-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
      ),
      body := jsonb_build_object('limit', 50),
      timeout_milliseconds := 60000
    );
    $cron$
  );
END $$;
