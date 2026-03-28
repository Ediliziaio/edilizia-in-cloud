-- Migrate landing_page data to landing_url
UPDATE public.attribution_sessions SET landing_url = landing_page WHERE landing_url IS NULL AND landing_page IS NOT NULL;
