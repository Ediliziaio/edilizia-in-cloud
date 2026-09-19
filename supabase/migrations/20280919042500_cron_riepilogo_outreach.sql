-- Riepilogo giornaliero dell'outreach al titolare (18/09/2026).
--
-- «Ogni giorno mandami una mail di riepilogo delle email mandate, risposte
-- ricevute, follow-up, tasso di invio…»: la funzione outreach-riepilogo conta
-- la giornata di ieri (ore di Roma) per brand e manda l'email. Parte alle
-- 05:30 UTC — le 07:30 a Roma d'estate, le 06:30 d'inverno — dopo il canarino
-- delle 05:03. Il segreto si legge dal Vault, mai scritto nel job.
select cron.unschedule('outreach-riepilogo')
 where exists (select 1 from cron.job where jobname = 'outreach-riepilogo');

select cron.schedule(
  'outreach-riepilogo',
  '30 5 * * *',
  $job$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/outreach-riepilogo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret')
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
