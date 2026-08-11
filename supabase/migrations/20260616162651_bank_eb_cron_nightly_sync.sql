-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Sync notturno Open Banking: ogni giorno alle 05:30 (UTC) chiama bank-eb-cron,
-- che sincronizza movimenti+saldi di tutte le connessioni 'linked' e segna
-- 'expired' quelle col consenso scaduto. Auth via x-cron-secret.
DO $$
BEGIN
  PERFORM cron.unschedule('bank-eb-nightly-sync');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No existing bank-eb-nightly-sync job';
END $$;

SELECT cron.schedule(
  'bank-eb-nightly-sync',
  '30 5 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/bank-eb-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cron$
);
