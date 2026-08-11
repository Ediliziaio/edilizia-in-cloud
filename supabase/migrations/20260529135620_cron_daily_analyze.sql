-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-analyze-public') THEN
    PERFORM cron.unschedule('daily-analyze-public');
  END IF;
  PERFORM cron.schedule('daily-analyze-public', '30 2 * * *', 'ANALYZE');
END $$;
