-- Il giro degli avvisi delle commesse generali, ogni ora dalle 6 alle 19 (ora di Roma, circa).
--
-- Acceso DOPO la pubblicazione della edge function generali-avvisi
-- (CLAUDE.md: un cron che dipende da una funzione si accende con una migrazione successiva al deploy).
-- Anteprima fatta il 02/11/2026 ({"anteprima": true}): 200, nessun errore, 3 generali guardate.
--
-- Una generale si guarda una volta al giorno; ogni giro ne prende al massimo 20 (le meno
-- recenti) e manda al massimo 25 email, dalle 7. La funzione risponde a pg_net entro 5 secondi
-- (serveConMetricheRapida): attesa 15 secondi, segreto dal Vault. Rilanciabile.

select cron.unschedule(jobid) from cron.job where jobname = 'generali-avvisi';

select cron.schedule(
  'generali-avvisi',
  '41 4-17 * * *',
  $$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/generali-avvisi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
