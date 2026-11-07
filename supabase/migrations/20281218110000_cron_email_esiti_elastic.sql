-- Accende il giro degli esiti Elastic Email ogni 15 minuti (07/11/2026).
--
-- Va dopo il deploy di elastic-email-esiti (20281218100000 ha creato la
-- funzione SQL): prima del cron si è vista la risposta vera di Elastic con
-- {"anteprima":true} — HTTP 200, campi MsgID/TransactionID/EventType/
-- EventDate/To/MessageCategory, tracciamento delle aperture acceso — e un
-- primo giro a mano ha scritto gli esiti dell'ultima settimana (Elastic tiene
-- circa sette giorni di eventi: lo storico più vecchio non si recupera).
--
-- Minuto 14 di ogni quarto d'ora: libero fra i job che girano ogni 15 minuti.
-- Attesa 15 secondi (la funzione risponde a pg_net entro 5 e finisce sotto
-- waitUntil). Il segreto si legge dal Vault, mai scritto nel job.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'elastic-email-esiti') then
    perform cron.unschedule('elastic-email-esiti');
  end if;
  perform cron.schedule('elastic-email-esiti', '14-59/15 * * * *', $job$
    select net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/elastic-email-esiti',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000);
  $job$);
end $$;
