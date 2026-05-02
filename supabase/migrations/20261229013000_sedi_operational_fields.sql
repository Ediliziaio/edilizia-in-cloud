-- ============================================================
-- Sedi operative: campi dati professionali e indici leggeri
-- ============================================================

ALTER TABLE public.sedi
  ADD COLUMN IF NOT EXISTS regione TEXT,
  ADD COLUMN IF NOT EXISTS nazione TEXT DEFAULT 'Italia',
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS responsabile_sede TEXT,
  ADD COLUMN IF NOT EXISTS orari_apertura TEXT,
  ADD COLUMN IF NOT EXISTS note_interne TEXT,
  ADD COLUMN IF NOT EXISTS lat NUMERIC,
  ADD COLUMN IF NOT EXISTS lng NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sedi_email_format'
  ) THEN
    ALTER TABLE public.sedi
      ADD CONSTRAINT sedi_email_format
      CHECK (email IS NULL OR email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sedi_lat_range'
  ) THEN
    ALTER TABLE public.sedi
      ADD CONSTRAINT sedi_lat_range CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sedi_lng_range'
  ) THEN
    ALTER TABLE public.sedi
      ADD CONSTRAINT sedi_lng_range CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180)) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sedi_company_tipo_attiva
  ON public.sedi(company_id, tipo, attiva);

CREATE INDEX IF NOT EXISTS idx_sedi_company_principale
  ON public.sedi(company_id, principale)
  WHERE principale = true;

CREATE INDEX IF NOT EXISTS idx_sedi_company_nome_lower
  ON public.sedi(company_id, lower(nome));
