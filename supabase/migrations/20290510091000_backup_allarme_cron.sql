-- Il controllo dell'allarme backup: due volte al giorno (23/11/2026)
-- 03:30 UTC, un'ora dopo il giro notturno del backup (02:30), quando anche le
-- aziende grandi a blocchi hanno finito; 15:30 per il promemoria a dodici ore.
-- Va DOPO il deploy di ops-canarino: la funzione rifiuta con 400 i modi che non
-- conosce, e un cron su una versione vecchia spedirebbe errori ogni volta.
select cron.schedule('backup-allarme-mattina', '30 3 * * *', $job$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/ops-canarino',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret' limit 1)
    ),
    body := '{"modo":"backup"}'::jsonb,
    timeout_milliseconds := 15000
  );
$job$);

select cron.schedule('backup-allarme-pomeriggio', '30 15 * * *', $job$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/ops-canarino',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret' limit 1)
    ),
    body := '{"modo":"backup"}'::jsonb,
    timeout_milliseconds := 15000
  );
$job$);
