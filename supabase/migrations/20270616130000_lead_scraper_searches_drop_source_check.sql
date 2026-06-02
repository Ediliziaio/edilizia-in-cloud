-- Il CHECK su lead_scraper_searches.source ammetteva solo google_maps/explorium/
-- linkedin → bloccava il salvataggio per tutte le fonti aggiunte dopo (internal,
-- apollo, apify_maps, company_search). lead_scraper_results non ha un vincolo
-- analogo e la sorgente è controllata dall'applicazione: rimuovo il CHECK.
ALTER TABLE public.lead_scraper_searches DROP CONSTRAINT IF EXISTS lead_scraper_searches_source_check;
