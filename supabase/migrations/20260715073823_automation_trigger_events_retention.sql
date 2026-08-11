-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Retention automation_trigger_events: 245k+ eventi processed accumulati
-- senza alcuna pulizia (la tabella cresceva per sempre). Gli eventi servono
-- solo come coda: una volta processati non vengono più letti da nessuno.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-automation-trigger-events') THEN
    PERFORM cron.unschedule('purge-automation-trigger-events');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-automation-trigger-events',
  '25 3 * * *',
  $$DELETE FROM public.automation_trigger_events WHERE processed = true AND created_at < now() - interval '30 days'$$
);

-- Pulizia iniziale una tantum
DELETE FROM public.automation_trigger_events
WHERE processed = true AND created_at < now() - interval '30 days';
