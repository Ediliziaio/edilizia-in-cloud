-- ════════════════════════════════════════════════════════════════════════════
-- GPS FleetTrack — Migration
-- Sprint: GPS FleetTrack Continuo
-- Tables: gps_positions, cantieri_geofence, tecnico_gps_consent
-- Alters: companies.fleet_track_enabled
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. companies: add fleet_track_enabled flag ────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS fleet_track_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.fleet_track_enabled IS
  'Abilita il modulo GPS FleetTrack (tracciamento continuo tecnici)';

-- ── 2. tecnico_gps_consent ────────────────────────────────────────────────
-- Consenso GDPR obbligatorio prima di avviare il tracciamento.
CREATE TABLE IF NOT EXISTS tecnico_gps_consent (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version       TEXT NOT NULL DEFAULT '1.0',       -- versione testo privacy
  consented_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  UNIQUE (user_id, company_id, version)
);

CREATE INDEX IF NOT EXISTS idx_tgc_user_company ON tecnico_gps_consent(user_id, company_id);

COMMENT ON TABLE tecnico_gps_consent IS
  'Consenso GDPR al tracciamento GPS dei tecnici';

-- ── 3. gps_positions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_positions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  accuracy      REAL,                              -- metri
  speed         REAL,                              -- m/s (null se fermo)
  heading       REAL,                              -- gradi 0-360
  battery_level SMALLINT,                          -- 0-100
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_company_user_recorded
  ON gps_positions(company_id, user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_gps_company_recorded
  ON gps_positions(company_id, recorded_at DESC);

COMMENT ON TABLE gps_positions IS
  'Posizioni GPS in tempo reale dei tecnici (retention 30 giorni)';

-- ── 4. cantieri_geofence ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cantieri_geofence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  nome          TEXT NOT NULL,
  center_lat    DOUBLE PRECISION NOT NULL,
  center_lng    DOUBLE PRECISION NOT NULL,
  radius_mt     INTEGER NOT NULL DEFAULT 200,      -- raggio in metri
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofence_company_active
  ON cantieri_geofence(company_id, is_active);

COMMENT ON TABLE cantieri_geofence IS
  'Geofence circolari associabili a un cantiere/ordine';

-- ── 5. RLS ────────────────────────────────────────────────────────────────

-- gps_positions
ALTER TABLE gps_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gps_positions_own_insert" ON gps_positions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gps_positions_company_select" ON gps_positions
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

-- tecnico_gps_consent
ALTER TABLE tecnico_gps_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tgc_own_all" ON tecnico_gps_consent
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tgc_company_select" ON tecnico_gps_consent
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- cantieri_geofence
ALTER TABLE cantieri_geofence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geofence_company_all" ON cantieri_geofence
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ── 6. pg_cron — pulizia automatica posizioni > 30 giorni ─────────────────
-- Richiede l'estensione pg_cron abilitata nel progetto Supabase.
-- Eseguito ogni notte alle 02:00 UTC.
DO $outer$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'gps-positions-cleanup',
      '0 2 * * *',
      'DELETE FROM gps_positions WHERE recorded_at < now() - INTERVAL ''30 days'''
    );
  END IF;
END;
$outer$;
