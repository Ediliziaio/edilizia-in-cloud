-- ============================================================================
-- MIGRAZIONE: Campo Sicurezza + Rapportini Vocali
-- Sprint: CAMPO-OFFLINE-001
-- Data: 2026-04-09
-- ============================================================================

-- ─── TABELLA: checklist_sicurezza ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_sicurezza (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  operaio_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  turno TEXT NOT NULL DEFAULT 'mattina' CHECK (turno IN ('mattina','pomeriggio','notte')),
  risposte JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  foto_urls TEXT[] DEFAULT '{}',
  completata BOOLEAN NOT NULL DEFAULT false,
  firmata BOOLEAN NOT NULL DEFAULT false,
  posizione_gps JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, operaio_id, data, turno)
);

CREATE INDEX IF NOT EXISTS idx_checklist_sicurezza_operaio_data
  ON checklist_sicurezza(operaio_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_sicurezza_company
  ON checklist_sicurezza(company_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_sicurezza_order
  ON checklist_sicurezza(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE checklist_sicurezza ENABLE ROW LEVEL SECURITY;

-- Operaio: vede solo le proprie
DROP POLICY IF EXISTS checklist_sel_own ON checklist_sicurezza;
CREATE POLICY checklist_sel_own ON checklist_sicurezza
  FOR SELECT
  USING (operaio_id = auth.uid());

-- Operaio: inserisce solo per sé
DROP POLICY IF EXISTS checklist_ins_own ON checklist_sicurezza;
CREATE POLICY checklist_ins_own ON checklist_sicurezza
  FOR INSERT
  WITH CHECK (
    operaio_id = auth.uid()
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Operaio: aggiorna solo le proprie dello stesso giorno
DROP POLICY IF EXISTS checklist_upd_own ON checklist_sicurezza;
CREATE POLICY checklist_upd_own ON checklist_sicurezza
  FOR UPDATE
  USING (operaio_id = auth.uid() AND data = CURRENT_DATE)
  WITH CHECK (operaio_id = auth.uid());

-- Responsabile sicurezza / admin: vede tutte della propria company
DROP POLICY IF EXISTS checklist_sel_company ON checklist_sicurezza;
CREATE POLICY checklist_sel_company ON checklist_sicurezza
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','company_admin','company_staff')
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_checklist_sicurezza_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_checklist_sicurezza_upd ON checklist_sicurezza;
CREATE TRIGGER trg_checklist_sicurezza_upd
  BEFORE UPDATE ON checklist_sicurezza
  FOR EACH ROW EXECUTE FUNCTION trg_checklist_sicurezza_updated();


-- ─── TABELLA: rapportini_vocali ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rapportini_vocali (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  operaio_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  audio_url TEXT,
  audio_duration_sec INTEGER,
  trascrizione TEXT,
  dati_estratti JSONB,
  ore_lavorate NUMERIC(4,2),
  lavorazione TEXT,
  materiali_usati JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','confermato','revisionato')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rapportini_vocali_operaio
  ON rapportini_vocali(operaio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapportini_vocali_company
  ON rapportini_vocali(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapportini_vocali_order
  ON rapportini_vocali(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE rapportini_vocali ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rapportini_vocali_sel_own ON rapportini_vocali;
CREATE POLICY rapportini_vocali_sel_own ON rapportini_vocali
  FOR SELECT
  USING (operaio_id = auth.uid());

DROP POLICY IF EXISTS rapportini_vocali_ins_own ON rapportini_vocali;
CREATE POLICY rapportini_vocali_ins_own ON rapportini_vocali
  FOR INSERT
  WITH CHECK (
    operaio_id = auth.uid()
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS rapportini_vocali_upd_own ON rapportini_vocali;
CREATE POLICY rapportini_vocali_upd_own ON rapportini_vocali
  FOR UPDATE
  USING (operaio_id = auth.uid())
  WITH CHECK (operaio_id = auth.uid());

DROP POLICY IF EXISTS rapportini_vocali_sel_company ON rapportini_vocali;
CREATE POLICY rapportini_vocali_sel_company ON rapportini_vocali
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','company_admin','company_staff')
    )
  );

CREATE OR REPLACE FUNCTION trg_rapportini_vocali_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rapportini_vocali_upd ON rapportini_vocali;
CREATE TRIGGER trg_rapportini_vocali_upd
  BEFORE UPDATE ON rapportini_vocali
  FOR EACH ROW EXECUTE FUNCTION trg_rapportini_vocali_updated();


-- ─── STORAGE BUCKETS ───────────────────────────────────────────────────────
-- Bucket campo-audio (privato, solo operaio owner)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campo-audio',
  'campo-audio',
  false,
  10485760, -- 10MB
  ARRAY['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket campo-foto (privato, con geotag watermark)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campo-foto',
  'campo-foto',
  false,
  15728640, -- 15MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy storage: operaio può upload/read solo le sue (path = operaio_id/...)
DROP POLICY IF EXISTS "campo_audio_own_read" ON storage.objects;
CREATE POLICY "campo_audio_own_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'campo-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "campo_audio_own_write" ON storage.objects;
CREATE POLICY "campo_audio_own_write" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'campo-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "campo_foto_own_read" ON storage.objects;
CREATE POLICY "campo_foto_own_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'campo-foto'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "campo_foto_own_write" ON storage.objects;
CREATE POLICY "campo_foto_own_write" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'campo-foto'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
