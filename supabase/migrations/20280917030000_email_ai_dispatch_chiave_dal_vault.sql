-- email-ai-dispatch-opportunita / -fatture: la chiave dal Vault, non nel comando.
--
-- I due job passavano il valore di PROACTIVE_CRON_SECRET scritto in chiaro nel
-- comando (cron.job.command è leggibile, e un dump se lo porta via). La regola
-- del progetto è leggerlo dal Vault a ogni esecuzione. Verificato il 15/09/2026
-- che il Vault `proactive_cron_secret` e la variabile delle funzioni coincidono:
-- le due funzioni SQL lo passano così com'è come header x-cron-secret.
-- Si cambia solo il comando: schedule e stato restano quelli attuali.

set local lock_timeout = '3s';

do $$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'email-ai-dispatch-opportunita-5min';
  if v_id is not null then
    perform cron.alter_job(
      job_id := v_id,
      command := $cmd$ SELECT public.silvio_email_dispatch_opportunita((select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret'), 10); $cmd$
    );
  end if;

  select jobid into v_id from cron.job where jobname = 'email-ai-dispatch-fatture-7min';
  if v_id is not null then
    perform cron.alter_job(
      job_id := v_id,
      command := $cmd$ SELECT public.silvio_email_dispatch_fatture((select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret'), 5); $cmd$
    );
  end if;
end $$;
