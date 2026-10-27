-- I due cron degli avvisi nuovi. Si creano ADESSO e non con la migrazione che ha
-- fatto le tabelle, perché un cron che chiama una funzione non ancora pubblicata
-- — o pubblicata con la verifica JWT accesa — risponde 401 e pg_cron segna
-- "succeeded" comunque: net.http_post considera riuscito l'aver SPEDITO la
-- richiesta e non guarda la risposta. Le due funzioni sono online (versione 2)
-- con verify_jwt = false in supabase/config.toml, provate a mano su Il Bagno
-- Group: 200 e email partite.
--
-- Il segreto si legge dal Vault: cron.job.command è una tabella leggibile e un
-- dump se lo porterebbe via.
--
-- Attese brevi (15 s) e minuti spostati dal quarto d'ora: pg_net ha UN worker e
-- una funzione lenta ferma la coda di tutti i cron.

select cron.unschedule('attese-operatore-sollecito') where exists (
  select 1 from cron.job where jobname = 'attese-operatore-sollecito');
select cron.unschedule('whatsapp-canale-controllo') where exists (
  select 1 from cron.job where jobname = 'whatsapp-canale-controllo');

-- Una volta al giorno, alle 07:10 UTC: l'elenco arriva quando si apre l'ufficio,
-- non durante la notte. La cadenza vera (una email al giorno per azienda) la
-- decide `avvisa_attese_operatore` nel database, quindi due giri non raddoppiano.
select cron.schedule(
  'attese-operatore-sollecito', '10 7 * * *',
  $job$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/attese-operatore-sollecito',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$);

-- Ogni ora al minuto 25. La guardia delle 24 ore per azienda sta nel database.
select cron.schedule(
  'whatsapp-canale-controllo', '25 * * * *',
  $job$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/whatsapp-canale-controllo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$);
