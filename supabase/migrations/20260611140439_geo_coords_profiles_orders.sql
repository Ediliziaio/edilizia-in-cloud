-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Coordinate geografiche per indirizzi clienti e cantieri commesse.
-- Popolate in automatico (best-effort) al salvataggio dei form tramite
-- geocoding HERE/Nominatim. Usate per distanze, percorsi e mappa.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address_lat double precision,
  ADD COLUMN IF NOT EXISTS address_lng double precision,
  ADD COLUMN IF NOT EXISTS site_lat double precision,
  ADD COLUMN IF NOT EXISTS site_lng double precision;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS work_lat double precision,
  ADD COLUMN IF NOT EXISTS work_lng double precision;

COMMENT ON COLUMN public.profiles.address_lat IS 'Lat residenza/sede cliente (geocoding automatico al salvataggio)';
COMMENT ON COLUMN public.profiles.site_lat IS 'Lat indirizzo cantiere cliente (geocoding automatico al salvataggio)';
COMMENT ON COLUMN public.orders.work_lat IS 'Lat indirizzo cantiere commessa (geocoding automatico al salvataggio)';
