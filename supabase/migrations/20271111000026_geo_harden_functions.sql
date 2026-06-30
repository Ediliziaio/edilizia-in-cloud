-- Hardening advisor sui nuovi oggetti geo (Fase 1/2):
-- - geo_norm: search_path fisso (funzione pura: usa solo built-in pg_catalog).
-- - enrich_marketing_contact_geo: revoca EXECUTE diretto. È una TRIGGER function
--   (gira automaticamente sul BEFORE INSERT/UPDATE come definer), non deve essere
--   invocabile direttamente da anon/authenticated → rimuove il warning
--   "security definer function executable by anon/authenticated".
-- Applicata in prod via MCP il 2026-06-30.
ALTER FUNCTION public.geo_norm(text) SET search_path = pg_catalog;
REVOKE EXECUTE ON FUNCTION public.enrich_marketing_contact_geo() FROM PUBLIC, anon, authenticated;
