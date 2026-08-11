-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- geo_cache: cache globale cross-company per geocoding (HERE / Nominatim)
CREATE TABLE IF NOT EXISTS public.geo_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('geocode', 'reverse')),
  payload jsonb NOT NULL,
  provider text NOT NULL DEFAULT 'here',
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_geo_cache_kind ON public.geo_cache (kind);

ALTER TABLE public.geo_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.geo_cache IS
  'Cache geocoding globale cross-company. Chiave: indirizzo normalizzato (geocode) o lat,lng arrotondate (reverse). Service-role only.';
