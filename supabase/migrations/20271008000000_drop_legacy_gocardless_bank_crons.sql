-- Codice morto: i cron GoCardless (bank-sync-all-companies @03:00, bank-check-expiry @08:00)
-- sono superati da bank-eb-nightly-sync (sync + rilevamento scadenza). Rimossi.
-- (Già applicata via MCP.)
DO $$ BEGIN PERFORM cron.unschedule('bank-sync-nightly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('bank-check-expiry-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
