-- Due difetti diffusi nei comandi dei cron.
--
-- 1) Sei job leggono l'URL e i segreti da parametri `app.*` che su questo
--    progetto NON esistono e non si possono impostare (Supabase vieta
--    ALTER DATABASE ... SET). current_setting() restituisce NULL, e il job
--    muore con "null value in column url of relation http_request_queue".
--    cleanup-capture-orphans fallisce cosi' da 14 giri, morning-briefing da 15,
--    e generate-recurring-costs — che genera i costi ricorrenti del mese —
--    fallirebbe al prossimo primo del mese. Unica via: valori letterali e il
--    segreto dal vault, come fanno i job che funzionano.
--
-- 2) Venticinque job chiamano net.http_post senza timeout_milliseconds. pg_net
--    usa allora il suo default di 5 secondi: la funzione parte e lavora, ma la
--    risposta arriva troppo tardi e viene registrata come fallimento. Il
--    lavoro si fa, il monitoraggio dice di no — che e' il modo piu' efficace
--    per rendere inutile un monitoraggio.

DO $$
DECLARE
  v_url  text := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/';
  v_job  record;
  v_new  text;
BEGIN
  -- ── 1) I sei job con parametri inesistenti, riscritti uno per uno ────────
  -- Tutte e sei le funzioni accettano il segreto interno del cron (a
  -- morning-briefing-capomastri e' stato appena aggiunto il controllo, che
  -- prima non aveva affatto).
  FOR v_job IN
    SELECT jobid, jobname, schedule, active,
           substring(command from 'functions/v1/([a-z0-9-]+)') AS fn,
           coalesce(substring(command from 'body := ''([^'']*)'''), '{}') AS corpo
    FROM cron.job
    WHERE command ILIKE '%current_setting(''app.%'
  LOOP
    IF v_job.fn IS NULL THEN CONTINUE; END IF;
    v_new := format(
      $q$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                            WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
        body := %L::jsonb,
        timeout_milliseconds := 120000);$q$,
      v_url || v_job.fn, v_job.corpo);

    -- Si conserva lo stato attivo/spento: tre di questi erano stati spenti a
    -- mano, verosimilmente perche' fallivano. Riaccenderli non e' una
    -- decisione tecnica — whatsapp-ai-recovery, per dirne una, manda messaggi.
    PERFORM cron.alter_job(v_job.jobid, command => v_new);
    RAISE NOTICE 'riscritto %  (attivo: %)', v_job.jobname, v_job.active;
  END LOOP;

  -- ── 2) Il timeout mancante ───────────────────────────────────────────────
  FOR v_job IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE command ILIKE '%net.http_post%'
      AND command NOT ILIKE '%timeout_milliseconds%'
  LOOP
    -- Si inserisce il parametro subito dopo il body, che tutti questi job
    -- hanno; il regex chiude sull'ultima parentesi della http_post.
    v_new := regexp_replace(
      v_job.command,
      '(body\s*:=\s*[^;]*?::jsonb)(\s*\))',
      '\1, timeout_milliseconds := 120000\2');
    IF v_new <> v_job.command THEN
      PERFORM cron.alter_job(v_job.jobid, command => v_new);
      RAISE NOTICE 'timeout aggiunto a %', v_job.jobname;
    ELSE
      RAISE NOTICE 'SALTATO (forma non riconosciuta): %', v_job.jobname;
    END IF;
  END LOOP;
END $$;

-- auto-genera-giornale-daily mandava la chiave ANON come Bearer: bastava per
-- passare il gateway, ma la funzione ora richiede il segreto del cron o la
-- service_role (prima non chiedeva nulla, ed era chiamabile da qualunque
-- utente autenticato). Il comando viene riscritto per mandare il segreto.
DO $$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'auto-genera-giornale-daily';
  IF v_id IS NULL THEN RETURN; END IF;
  PERFORM cron.alter_job(v_id, command => $cmd$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/auto-genera-giornale-cantiere',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000);
  $cmd$);
END $$;
