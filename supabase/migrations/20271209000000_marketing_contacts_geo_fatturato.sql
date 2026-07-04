-- Mappa CRM — colonne per posizione precisa e fatturato sui contatti prospect.
-- Additiva/idempotente: la geocodifica stradale (lat/lng) e il fatturato
-- (dall'import) popoleranno queste colonne; il popup della mappa le legge.
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS fatturato numeric,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
