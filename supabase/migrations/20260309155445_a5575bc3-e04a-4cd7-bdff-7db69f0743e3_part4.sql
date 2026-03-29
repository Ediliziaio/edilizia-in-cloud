-- ════════════════════════════════════════════════════════════════
-- TABELLA 4: Pagamenti registrati sulla fattura
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  amount         NUMERIC(12,2) NOT NULL,
  payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference      TEXT,
  notes          TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
