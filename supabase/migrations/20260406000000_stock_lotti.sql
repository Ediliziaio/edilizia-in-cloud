-- M6: Stock Lotti — tracciamento lotti con scadenza per il magazzino

CREATE TABLE IF NOT EXISTS stock_lotti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  codice_lotto TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  quantita NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unita_misura TEXT DEFAULT 'pz',
  data_scadenza DATE,
  posizione TEXT,
  fornitore TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE stock_lotti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_lotti_company_access" ON stock_lotti
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_stock_lotti_company_scadenza ON stock_lotti(company_id, data_scadenza);

COMMENT ON TABLE stock_lotti IS 'Lotti di magazzino con tracciamento scadenza e giacenza';
