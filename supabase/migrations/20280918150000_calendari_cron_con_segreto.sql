-- Job dei calendari: il segreto interno dal Vault, non la sola chiave anon.
--
-- google-calendar-sync-every-15min, outlook-calendar-sync-every-15min e
-- google-calendar-renew-watches-6h passavano solo `Authorization: Bearer
-- <chiave anon>` scritta in chiaro nel comando. La chiave anon è pubblica (sta
-- nel bundle del sito): con quella chiunque poteva far partire la
-- sincronizzazione di tutti i calendari di tutte le aziende, e il rinnovo dei
-- canali Google non controllava nemmeno quella.
--
-- Da qui i job mandano anche x-cron-secret (silvio_internal_cron_secret, lo
-- stesso che google-calendar-sync già accetta dai trigger) e leggono entrambi
-- i valori dal Vault a ogni esecuzione. Le edge function, nel commit che
-- accompagna questa migrazione, pretendono il segreto per queste azioni.
-- Schedule e stato restano quelli attuali.

set local lock_timeout = '3s';

do $$
declare
  v_id bigint;
  v_headers text := $h$jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret' limit 1)
    )$h$;
begin
  select jobid into v_id from cron.job where jobname = 'google-calendar-sync-every-15min';
  if v_id is not null then
    perform cron.alter_job(job_id := v_id, command := format($c$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-calendar-sync',
    headers := %s,
    body := '{"action": "cron-full-sync"}'::jsonb, timeout_milliseconds := 120000
  );$c$, v_headers));
  end if;

  select jobid into v_id from cron.job where jobname = 'outlook-calendar-sync-every-15min';
  if v_id is not null then
    perform cron.alter_job(job_id := v_id, command := format($c$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/outlook-calendar-sync',
    headers := %s,
    body := '{"action": "cron-full-sync"}'::jsonb, timeout_milliseconds := 120000
  );$c$, v_headers));
  end if;

  select jobid into v_id from cron.job where jobname = 'google-calendar-renew-watches-6h';
  if v_id is not null then
    perform cron.alter_job(job_id := v_id, command := format($c$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-calendar-webhook?action=renew_watches',
    headers := %s,
    body := '{}'::jsonb, timeout_milliseconds := 120000
  );$c$, v_headers));
  end if;
end $$;
