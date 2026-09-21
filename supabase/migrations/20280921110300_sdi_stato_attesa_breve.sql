-- Esiti SDI: il cron aspetta al massimo 15 secondi (21/09/2026).
--
-- Il job sdi-stato-quarto-dora (20280920150000) aspettava la risposta fino a
-- 120 secondi. pg_net ha un solo worker e una coda sola per tutti i cron: una
-- funzione lenta li ferma tutti per quel tempo (vedi «Cron e pg_net» in
-- CLAUDE.md). sdi-stato-tick risponde ora entro 5 secondi e finisce il giro in
-- background (serveConMetricheRapida): l'attesa scende a 15 secondi, come per
-- le altre funzioni rapide.

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sdi-stato-quarto-dora';
SELECT cron.schedule(
  'sdi-stato-quarto-dora',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/sdi-stato-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret')
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
