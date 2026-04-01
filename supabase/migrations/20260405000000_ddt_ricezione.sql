-- M4: DDT Ricezione per Ordini di Acquisto

CREATE TABLE IF NOT EXISTS ddt_ricezione (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  numero_ddt TEXT NOT NULL,
  data_ricezione DATE NOT NULL DEFAULT CURRENT_DATE,
  quantita_ricevuta NUMERIC(10, 2) NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'ricevuto' CHECK (stato IN ('attesa', 'parziale', 'ricevuto')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE ddt_ricezione ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ddt_ricezione_company_access" ON ddt_ricezione
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE ddt_ricezione IS 'Documenti di Trasporto ricevuti per ogni Ordine di Acquisto';
