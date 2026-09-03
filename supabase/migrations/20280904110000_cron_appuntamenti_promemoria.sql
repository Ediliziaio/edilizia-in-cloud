-- Promemoria appuntamenti ogni 15 minuti (sfalsato dagli altri job per non
-- accavallare le chiamate). Il secret e' preso dal job gia' esistente, cosi'
-- non compare in chiaro in questo file.
DO $$
DECLARE
  v_secret text;
  v_cmd text;
BEGIN
  SELECT substring(command from 'x-cron-secret'',''([a-f0-9]+)') INTO v_secret
  FROM cron.job WHERE jobname = 'outreach-imap-poll' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE NOTICE 'Secret cron non trovato: job promemoria non creato';
    RETURN;
  END IF;

  v_cmd := format($f$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/appuntamenti-promemoria',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  );$f$, v_secret);

  PERFORM cron.unschedule('appuntamenti-promemoria') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'appuntamenti-promemoria');
  PERFORM cron.schedule('appuntamenti-promemoria', '7-59/15 * * * *', v_cmd);
END $$;
