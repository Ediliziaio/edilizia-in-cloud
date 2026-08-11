-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Hardening advisor (Fase 1/2 geo): fissa search_path di geo_norm (funzione pura)
-- e revoca EXECUTE diretto sulla trigger function enrich_marketing_contact_geo
-- (gira come trigger, non va chiamata direttamente da anon/authenticated).
-- Applicata in prod via MCP il 2026-06-30.
ALTER FUNCTION public.geo_norm(text) SET search_path = pg_catalog;
REVOKE EXECUTE ON FUNCTION public.enrich_marketing_contact_geo() FROM PUBLIC, anon, authenticated;
