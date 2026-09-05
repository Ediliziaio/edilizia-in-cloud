-- Due cron venivano rifiutati dal GATEWAY prima ancora di eseguire il codice:
-- 401 UNAUTHORIZED_NO_AUTH_HEADER, 37 volte nelle ultime 24 ore.
--
-- apple-calendar-sync e generate-recurring-costs sono chiamate ANCHE dal
-- frontend, quindi devono tenere verify_jwt acceso: spegnerlo toglierebbe la
-- validazione del JWT sul percorso utente. Il gateway pero' pretende un
-- Authorization con un JWT valido, e i due job mandavano solo x-cron-secret.
--
-- La correzione sta sul chiamante: si aggiunge la chiave ANON come Bearer.
-- Non e' un segreto — sta nel bundle del sito, la legge chiunque apra il
-- browser — e serve solo a soddisfare il gateway: l'autenticazione VERA
-- resta il cron secret, che le due funzioni verificano con cronSecretValido.
-- La chiave sta nel vault come 'supabase_anon_key' per non incollarla qui.

DO $$
DECLARE
  v_url  text := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/';
  v_job  record;
  v_new  text;
BEGIN
  FOR v_job IN
    SELECT jobid, jobname,
           substring(command from 'functions/v1/([a-z0-9-]+)') AS fn,
           coalesce(substring(command from 'body := ''([^'']*)'''), '{}') AS corpo
    FROM cron.job
    WHERE jobname IN ('apple-calendar-sync-every-10min', 'generate-recurring-costs-monthly')
  LOOP
    IF v_job.fn IS NULL THEN CONTINUE; END IF;
    v_new := format(
      $q$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
                                         WHERE name = 'supabase_anon_key' LIMIT 1),
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                            WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
        body := %L::jsonb,
        timeout_milliseconds := 120000);$q$,
      v_url || v_job.fn, v_job.corpo);
    PERFORM cron.alter_job(v_job.jobid, command => v_new);
    RAISE NOTICE 'Bearer aggiunto a %', v_job.jobname;
  END LOOP;
END $$;
