-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-SA-INTEL-01: estrazione segnali conversazione, cron notturno 03:15 UTC.
DO $$ BEGIN PERFORM cron.unschedule('sa-conversation-intel-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'sa-conversation-intel-daily', '15 3 * * *',
  $$ SELECT public.silvio_invoke_edge('sa-conversation-intel-daily', '{}'::jsonb); $$
);
