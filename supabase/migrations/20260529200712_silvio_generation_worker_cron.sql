-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-SILVIO-CREATIVE-01: cron del worker render artefatti (ogni 2 min).
-- Riusa silvio_invoke_edge (secret dal Vault). Processa solo job 'image' queued.
DO $$ BEGIN
  PERFORM cron.unschedule('silvio-generation-worker-2min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'silvio-generation-worker-2min',
  '*/2 * * * *',
  $$ SELECT public.silvio_invoke_edge('silvio-generation-worker', '{}'::jsonb); $$
);
