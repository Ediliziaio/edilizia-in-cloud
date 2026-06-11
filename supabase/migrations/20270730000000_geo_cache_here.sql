-- geo_cache: cache globale cross-company per geocoding (HERE / Nominatim)
-- Lo stesso indirizzo geocodificato da un'azienda viene riusato da tutte:
-- riduce le chiamate API del 70-80% e disinnesca il rischio rate-limit
-- quando più aziende invocano il sistema contemporaneamente.
--
-- Accesso: SOLO service role (edge function geo-router). Nessuna policy RLS.

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
-- Nessuna policy: accesso esclusivo via service role nelle edge functions.

COMMENT ON TABLE public.geo_cache IS
  'Cache geocoding globale cross-company. Chiave: indirizzo normalizzato (geocode) o lat,lng arrotondate (reverse). Service-role only.';
