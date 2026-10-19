-- Le automazioni del bot WhatsApp (18/10/2026).
--
-- 1. Il giro ogni 15 minuti aspetta 15 secondi, come gli altri cron: passava da
--    silvio_invoke_edge, che usa l'attesa di base di pg_net (5 secondi), pari a
--    quella con cui la funzione risponde. Ora la funzione risponde subito e
--    finisce il lavoro da sola.
-- 2. Su Demo Azienda 2 le cose del giorno agli operai partono solo verso i numeri
--    scritti in «solo_telefoni»: i dipendenti di prova hanno numeri che possono
--    essere di persone vere. Elenco vuoto = nessun invio finché non si aggiunge
--    il numero di chi fa la prova. Non tocca un elenco già scritto.
--
-- Rilanciabile.

set local lock_timeout = '3s';

select cron.unschedule(jobid) from cron.job where jobname = 'bot-routine-dispatch';

select cron.schedule(
  'bot-routine-dispatch',
  '5-59/15 * * * *',
  $$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/bot-routine-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);

update public.bot_routine
   set regole = coalesce(regole, '{}'::jsonb) || jsonb_build_object('solo_telefoni', '[]'::jsonb)
 where company_id = 'd2000000-0000-4000-a000-000000000002'
   and tipo in ('todo_operaio', 'rapportino_sera')
   and not (coalesce(regole, '{}'::jsonb) ? 'solo_telefoni');
