-- ════════════════════════════════════════════════════════════════
-- TABELLA 3: Righe fattura (line items)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  description  TEXT NOT NULL,
  product_code TEXT,
  unit         TEXT DEFAULT 'pz',
  quantity          NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(12,4) NOT NULL DEFAULT 0,
  discount_percent  NUMERIC(5,2)  DEFAULT 0,
  tax_rate   NUMERIC(5,2) NOT NULL DEFAULT 22,
  tax_nature TEXT,
  line_net   NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_tax   NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
