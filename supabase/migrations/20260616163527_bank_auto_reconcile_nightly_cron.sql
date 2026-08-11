-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Riconciliazione automatica notturna alle 06:00 (dopo il sync delle 05:30).
-- bank-auto-reconcile matcha incassi→fatture e uscite→scadenze (score >= 80 auto).
DO $$
BEGIN
  PERFORM cron.unschedule('bank-auto-reconcile-nightly');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No existing bank-auto-reconcile-nightly job';
END $$;

SELECT cron.schedule(
  'bank-auto-reconcile-nightly',
  '0 6 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/bank-auto-reconcile',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cron$
);
