-- Il cron di silvio-trigger-tick entra nel repository (08/11/2026).
--
-- Il job «silvio-trigger-tick-6h» girava in produzione ogni 6 ore, ma nessuna
-- migrazione lo creava: era stato acceso a mano. Chi cercava nel codice chi
-- chiama la funzione non trovava niente, e la funzione sembrava abbandonata.
--
-- Qui lo stesso job, identico a quello in produzione: stesso nome, stesso
-- orario, stesso segreto letto dal Vault, stessa attesa. cron.schedule con un
-- nome che esiste già aggiorna il job invece di crearne un secondo.
--
-- L'attesa resta 120 secondi: silvio-trigger-tick non usa ancora
-- serveConMetricheRapida, e accorciarla prima di convertirla la farebbe
-- ritirare a metà lavoro (vedi CLAUDE.md, «Cron e pg_net»). È fra quelle da
-- convertire.

select cron.schedule(
  'silvio-trigger-tick-6h',
  '23 */6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/silvio-trigger-tick',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret')),
    body := '{"source":"pg_cron_6h"}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $cron$
);
