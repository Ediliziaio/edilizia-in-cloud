-- F4-07 — Backup settimanale per azienda.
--
-- Domenica notte, quando la piattaforma è ferma. L'export finisce nel bucket
-- company-exports, lo stesso che raccoglie gli export pre-cancellazione: un
-- posto solo dove cercare quando serve rimettere in piedi un'azienda.
--
-- PROVA DI RIPRISTINO — da eseguire una volta a trimestre, altrimenti non è un
-- backup ma una speranza:
--   1. scaricare l'ultimo export di un'azienda dal bucket
--   2. ricrearla su un branch Supabase di prova
--   3. verificare che commesse, preventivi e fatture tornino con gli stessi
--      totali dell'originale
--   4. annotare data e tempo impiegato: il tempo di ripristino è il numero che
--      conta davvero quando succede sul serio

SELECT cron.schedule(
  'company-backup-settimanale',
  '30 2 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/company-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
