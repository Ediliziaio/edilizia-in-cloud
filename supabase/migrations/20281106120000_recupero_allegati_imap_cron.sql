-- Fa girare il recupero degli allegati IMAP (20281106100000) a piccoli lotti.
-- Applicata dopo il deploy di email-poll-inbox. Quando le caselle sono finite il
-- job si toglie da solo.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recupero-allegati-imap';
  PERFORM cron.schedule('recupero-allegati-imap', '* * * * *', $job$
    DO $g$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.email_recupero_allegati WHERE finito_at IS NULL) THEN
        PERFORM net.http_post(
          url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-poll-inbox',
          headers := jsonb_build_object('Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret')),
          body := '{"modo": "recupera_allegati"}'::jsonb,
          timeout_milliseconds := 15000);
      ELSE
        PERFORM cron.unschedule('recupero-allegati-imap');
      END IF;
    END $g$;
  $job$);
END $$;
