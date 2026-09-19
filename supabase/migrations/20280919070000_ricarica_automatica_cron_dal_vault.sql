-- Il cron della ricarica automatica non porta più una chiave scritta in chiaro.
--
-- auto-topup-check aveva la chiave anon incollata nel comando (cron.job è una
-- tabella leggibile: CLAUDE.md, «Segreti»). E la funzione accettava qualunque
-- Bearer: bastava quella chiave pubblica per far partire gli addebiti sulle
-- carte. Ora il cron manda il segreto interno dal Vault, e la funzione
-- (auto-topup-trigger) accetta solo quello. Il Bearer anon resta, sempre dal
-- Vault, perché auto-topup-trigger ha verify_jwt = true e il gateway vuole un
-- JWT prima di arrivare al codice.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'auto-topup-check'),
  command := $cmd$SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/auto-topup-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );$cmd$
);
