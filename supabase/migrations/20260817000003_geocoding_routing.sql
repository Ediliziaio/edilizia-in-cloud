-- ════════════════════════════════════════════════════════════════════════════
-- Geocoding & Routing — Migration
-- Aggiunge:
--   gps_positions.address      — indirizzo reverse-geocodificato (Nominatim)
--   tickets.lat_intervento     — latitudine geocodificata dall'indirizzo
--   tickets.lng_intervento     — longitudine geocodificata dall'indirizzo
-- ════════════════════════════════════════════════════════════════════════════

-- ── gps_positions: indirizzo leggibile ───────────────────────────────────────
ALTER TABLE gps_positions
  ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN gps_positions.address IS
  'Indirizzo leggibile ottenuto via reverse geocoding Nominatim (cache 4 decimali)';

-- ── tickets: coordinate geocodificate dall''indirizzo_intervento ─────────────
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS lat_intervento DOUBLE PRECISION;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS lng_intervento DOUBLE PRECISION;

COMMENT ON COLUMN tickets.lat_intervento IS
  'Latitudine geocodificata da indirizzo_intervento (Nominatim forward geocoding)';

COMMENT ON COLUMN tickets.lng_intervento IS
  'Longitudine geocodificata da indirizzo_intervento (Nominatim forward geocoding)';

-- Indice per ricerca posizioni non geocodificate (usato da geocode-batch)
CREATE INDEX IF NOT EXISTS idx_gps_positions_no_address
  ON gps_positions(company_id, recorded_at DESC)
  WHERE address IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_no_coords
  ON tickets(company_id)
  WHERE indirizzo_intervento IS NOT NULL
    AND lat_intervento IS NULL;
