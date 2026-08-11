-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Il CHECK ammetteva solo google_maps/explorium/linkedin → bloccava le fonti nuove
-- (internal, apollo, apify_maps, company_search). lead_scraper_results non ha vincolo
-- analogo: la sorgente è controllata dall'app. Rimuovo il CHECK per coerenza.
ALTER TABLE public.lead_scraper_searches DROP CONSTRAINT IF EXISTS lead_scraper_searches_source_check;
