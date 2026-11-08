-- Il giro che comprime i backup già scritti (8 novembre 2026): ogni 5 minuti, 20 MB alla volta.
-- La funzione risponde subito (202) e lavora in sottofondo; l'attesa corta non ferma la coda di pg_net.
select cron.schedule(
  'company-backup-comprimi',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/company-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret')
    ),
    body := '{"comprimi":true}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$
);
