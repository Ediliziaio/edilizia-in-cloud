-- MP-SA-INTEL-01: estrazione segnali conversazione cross-tenant, cron notturno (03:15 UTC).
-- Classifica i messaggi utente→Silvio del giorno in segnali anonimi e ricalcola sa_company_intel.
DO $$ BEGIN PERFORM cron.unschedule('sa-conversation-intel-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'sa-conversation-intel-daily', '15 3 * * *',
  $$ SELECT public.silvio_invoke_edge('sa-conversation-intel-daily', '{}'::jsonb); $$
);
