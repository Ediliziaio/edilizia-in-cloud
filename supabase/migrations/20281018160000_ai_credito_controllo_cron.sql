-- Il controllo del credito AI ogni 5 minuti (18/10/2026).
--
-- ops-canarino in modo «credito-ai» (sonda a OpenRouter, saldo, chiusura degli
-- allarmi, email al titolare con il motivo) è pubblicato, ma il cron che lo
-- chiama non era mai stato acceso: come previsto, andava acceso con una
-- migrazione successiva al deploy della funzione (CLAUDE.md, «Il credito AI
-- finisce»). Provato in anteprima il 18/10/2026: risposta in 1,8 secondi, sonda
-- da 0,0001 $.
--
-- Attesa 15 secondi (regola dei cron), segreto letto dal Vault. Rilanciabile.

select cron.unschedule(jobid) from cron.job where jobname = 'ai-credito-controllo';

select cron.schedule(
  'ai-credito-controllo',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/ops-canarino',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret' limit 1)
    ),
    body := '{"modo":"credito-ai"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
