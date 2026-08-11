-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Codice morto: i cron GoCardless (bank-sync-all-companies, bank-check-expiry)
-- sono superati da bank-eb-nightly-sync (sync+scadenza in un colpo). Rimossi.
DO $$ BEGIN PERFORM cron.unschedule('bank-sync-nightly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('bank-check-expiry-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
