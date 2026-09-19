-- Backup settimanale dell'area super admin, a blocchi (vedi company-backup e
-- 20280919100000_backup_piattaforma_a_blocchi.sql).
--
-- Domenica alle 03:15 UTC, dopo il backup delle altre aziende (02:30): il
-- lavoro gira in sottofondo nella funzione e dura qualche minuto, quindi pg_net
-- riceve subito un 202 e non aspetta. La chiave interna arriva dal Vault.

select cron.unschedule(jobid) from cron.job where jobname = 'company-backup-piattaforma';

select cron.schedule(
  'company-backup-piattaforma',
  '15 3 * * 0',
  $cmd$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/company-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
    body := '{"piattaforma": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);
