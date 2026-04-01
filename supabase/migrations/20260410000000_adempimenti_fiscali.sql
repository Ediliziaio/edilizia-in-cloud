-- M17: Adempimenti Fiscali — scadenzario ricorrente obblighi tributari

CREATE TABLE IF NOT EXISTS adempimenti_fiscali (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL,
  descrizione TEXT,
  tipo TEXT NOT NULL DEFAULT 'iva' CHECK (tipo IN ('iva', 'inps', 'irpef', 'f24', '730', 'cud', 'inail', 'acconto', 'saldo', 'altro')),
  scadenza DATE NOT NULL,
  importo_stimato NUMERIC(10, 2),
  stato TEXT NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'pagato', 'prorogato', 'non_dovuto')),
  ricorrente BOOLEAN NOT NULL DEFAULT false,
  ricorrenza_mesi INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_adempimenti_fiscali_company_scadenza ON adempimenti_fiscali(company_id, scadenza);

ALTER TABLE adempimenti_fiscali ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adempimenti_fiscali_company_access" ON adempimenti_fiscali
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE adempimenti_fiscali IS 'Scadenzario obblighi tributari e contributivi aziendali';
