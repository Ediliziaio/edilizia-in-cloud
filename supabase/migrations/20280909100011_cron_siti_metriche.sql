-- Una volta al giorno, di notte. Si riscarica una finestra di quattordici
-- giorni e non solo quello prima: Search Console pubblica i dati con due o tre
-- giorni di ritardo e li corregge anche dopo, quindi prendere solo l'ultimo
-- giorno significherebbe fotografare sempre un numero provvisorio.
--
-- Alle 05:35 UTC: dopo il canarino delle 05:00, per non accavallarsi.
SELECT cron.schedule(
  'siti-metriche-sync-daily',
  '35 5 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/siti-metriche-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := jsonb_build_object('azione', 'sincronizza', 'giorni', 14),
    timeout_milliseconds := 600000
  ) AS request_id;
  $$
);
