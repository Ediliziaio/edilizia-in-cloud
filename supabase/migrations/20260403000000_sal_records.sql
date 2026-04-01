-- M1: SAL — Stato Avanzamento Lavori

CREATE TABLE IF NOT EXISTS sal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  numero_sal INTEGER NOT NULL DEFAULT 1,
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'emesso', 'approvato')),
  importo_totale NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS sal_voci (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sal_id UUID NOT NULL REFERENCES sal_records(id) ON DELETE CASCADE,
  descrizione TEXT NOT NULL,
  importo_contrattuale NUMERIC(12, 2) NOT NULL DEFAULT 0,
  percentuale_avanzamento NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (percentuale_avanzamento >= 0 AND percentuale_avanzamento <= 100),
  importo_sal NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(importo_contrattuale * percentuale_avanzamento / 100, 2)) STORED,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE sal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sal_voci ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sal_records_company_access" ON sal_records
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sal_voci_via_sal" ON sal_voci
  FOR ALL USING (
    sal_id IN (
      SELECT id FROM sal_records WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
      )
    )
  );

-- Comments
COMMENT ON TABLE sal_records IS 'Stato Avanzamento Lavori — certificati periodici di avanzamento cantiere';
COMMENT ON TABLE sal_voci IS 'Voci di ogni SAL con percentuale di avanzamento e importo calcolato';
COMMENT ON COLUMN sal_records.stato IS 'bozza = in lavorazione, emesso = inviato al cliente, approvato = firmato/accettato';
