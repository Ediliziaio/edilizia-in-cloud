-- ============================================================================
-- COMPUTO METRICO → PREVENTIVO AI
-- Tabelle per upload, estrazione AI, prezzari regionali
-- ============================================================================

-- 1. computo_uploads — tracking upload e stato estrazione
CREATE TABLE public.computo_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf','xlsx','xls','xpwe','dcf','image')),
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  extraction_status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (extraction_status IN ('uploading','extracting_text','analyzing_ai','validating','review','generating','completed','failed')),
  extraction_method TEXT CHECK (extraction_method IN ('pdf_text','pdf_vision','xlsx_parse','xpwe_parse')),
  extraction_confidence NUMERIC(4,3),
  extraction_completed_at TIMESTAMPTZ,
  extraction_error TEXT,
  raw_extracted_json JSONB,
  -- Metadata estratti dal computo
  oggetto_lavori TEXT,
  committente TEXT,
  progettista TEXT,
  data_computo DATE,
  -- Link al preventivo generato
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_computo_uploads_company ON computo_uploads(company_id);
CREATE INDEX idx_computo_uploads_status ON computo_uploads(extraction_status);

-- 2. computo_voci_estratte — voci pre-review prima di generare preventivo
CREATE TABLE public.computo_voci_estratte (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  computo_upload_id UUID NOT NULL REFERENCES computo_uploads(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Dati estratti
  capitolo_numero INTEGER,
  capitolo_nome TEXT,
  codice_voce TEXT,
  codice_prezzario TEXT,
  descrizione_breve TEXT NOT NULL,
  descrizione_estesa TEXT,
  unita_misura TEXT,
  quantita NUMERIC(14,4) DEFAULT 0,
  prezzo_unitario_computo NUMERIC(12,4) DEFAULT 0,
  importo_computo NUMERIC(14,2) DEFAULT 0,
  -- Prezzi impresa (editati dall'utente nel preview)
  prezzo_unitario_impresa NUMERIC(12,4),
  ricarico_percentuale NUMERIC(6,2),
  sconto_percentuale NUMERIC(6,2) DEFAULT 0,
  importo_impresa NUMERIC(14,2),
  -- AI metadata
  confidence NUMERIC(4,3) DEFAULT 0.5,
  warnings TEXT[],
  ai_notes TEXT,
  -- Review flags
  is_included BOOLEAN DEFAULT true,
  is_modified BOOLEAN DEFAULT false,
  ordine INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_computo_voci_upload ON computo_voci_estratte(computo_upload_id);
CREATE INDEX idx_computo_voci_company ON computo_voci_estratte(company_id);

-- 3. prezzari — prezzari regionali
CREATE TABLE public.prezzari (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  regione TEXT,
  anno INTEGER NOT NULL,
  fonte TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. prezzario_voci — voci del prezzario
CREATE TABLE public.prezzario_voci (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prezzario_id UUID NOT NULL REFERENCES prezzari(id) ON DELETE CASCADE,
  codice TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  unita_misura TEXT,
  prezzo NUMERIC(12,4),
  categoria TEXT,
  sotto_categoria TEXT,
  UNIQUE(prezzario_id, codice)
);

CREATE INDEX idx_prezzario_voci_codice ON prezzario_voci(codice);
CREATE INDEX idx_prezzario_voci_search ON prezzario_voci
  USING gin(to_tsvector('italian', descrizione));

-- 5. ALTER TABLE quotes — source + link computo
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS computo_upload_id UUID REFERENCES computo_uploads(id) ON DELETE SET NULL;

-- 6. ALTER TABLE quote_items — link voce computo + codice prezzario
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS computo_voce_id UUID REFERENCES computo_voci_estratte(id) ON DELETE SET NULL;
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS codice_prezzario TEXT;

-- 7. ALTER TABLE companies — contatore utilizzo AI computo
ALTER TABLE companies ADD COLUMN IF NOT EXISTS computo_ai_monthly_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS computo_ai_monthly_limit INTEGER DEFAULT 3;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS computo_ai_reset_date DATE DEFAULT CURRENT_DATE;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE computo_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE computo_voci_estratte ENABLE ROW LEVEL SECURITY;
ALTER TABLE prezzari ENABLE ROW LEVEL SECURITY;
ALTER TABLE prezzario_voci ENABLE ROW LEVEL SECURITY;

-- computo_uploads: utenti della stessa azienda
CREATE POLICY "computo_uploads_select" ON computo_uploads FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computo_uploads_insert" ON computo_uploads FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computo_uploads_update" ON computo_uploads FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computo_uploads_delete" ON computo_uploads FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- computo_voci_estratte: stessa logica
CREATE POLICY "computo_voci_select" ON computo_voci_estratte FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computo_voci_insert" ON computo_voci_estratte FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computo_voci_update" ON computo_voci_estratte FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computo_voci_delete" ON computo_voci_estratte FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- prezzari: company-scoped (null company_id = globale, visibile a tutti)
CREATE POLICY "prezzari_select" ON prezzari FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "prezzari_insert" ON prezzari FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- prezzario_voci: accessibili se il prezzario è visibile
CREATE POLICY "prezzario_voci_select" ON prezzario_voci FOR SELECT
  USING (prezzario_id IN (
    SELECT id FROM prezzari WHERE company_id IS NULL
    OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'computi',
  'computi',
  false,
  52428800, -- 50MB
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/xml','application/xml','image/jpeg','image/png']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS: solo utenti della stessa azienda
CREATE POLICY "computi_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'computi' AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computi_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'computi' AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "computi_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'computi' AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  ));
