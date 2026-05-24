-- Runner ogni 15 minuti: la funzione decide se l'orario aziendale del reminder e raggiunto.

BEGIN;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-operational-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-operational-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'whatsapp-operational-reminders',
      '*/15 * * * *',
      $$ SELECT public.silvio_invoke_edge('whatsapp-operational-reminders', '{}'::jsonb); $$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[whatsapp-operational-reminders] cron non configurato: %', SQLERRM;
END $$;

COMMIT;
