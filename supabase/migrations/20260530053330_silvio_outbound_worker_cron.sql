-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DO $$ BEGIN
  PERFORM cron.unschedule('silvio-outbound-worker-3min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'silvio-outbound-worker-3min',
  '*/3 * * * *',
  $$ SELECT public.silvio_invoke_edge('silvio-outbound-worker', '{}'::jsonb); $$
);
