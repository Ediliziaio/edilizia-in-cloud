
-- ════════════════════════════════════════════════════════════════
-- TABELLA 1: Configurazione integrazione per company
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS billing_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  is_primary  BOOLEAN DEFAULT false,
  access_token        TEXT,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  api_key             TEXT,
  company_external_id TEXT,
  provider_company_name TEXT,
  provider_vat_number TEXT,
  auto_sync       BOOLEAN DEFAULT true,
  sync_direction  TEXT DEFAULT 'both',
  last_sync_at    TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_integrations_primary
  ON billing_integrations(company_id)
  WHERE is_primary = true AND is_active = true;

-- ════════════════════════════════════════════════════════════════
-- TABELLA 2: Fatture
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number     TEXT,
  invoice_year       INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
  progressive_number INTEGER,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  status TEXT NOT NULL DEFAULT 'draft',
  client_id           UUID REFERENCES marketing_contacts(id),
  client_company_name TEXT NOT NULL,
  client_vat_number   TEXT,
  client_fiscal_code  TEXT,
  client_address      TEXT,
  client_city         TEXT,
  client_zip          TEXT,
  client_country      TEXT DEFAULT 'IT',
  client_pec          TEXT,
  client_sdi_code     TEXT,
  client_email        TEXT,
  issue_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date     DATE,
  payment_date DATE,
  subtotal     NUMERIC(12,2) DEFAULT 0,
  tax_amount   NUMERIC(12,2) DEFAULT 0,
  total        NUMERIC(12,2) DEFAULT 0,
  paid_amount  NUMERIC(12,2) DEFAULT 0,
  payment_method TEXT,
  payment_terms  TEXT,
  payment_days   INTEGER,
  bank_iban      TEXT,
  order_id            UUID REFERENCES orders(id),
  quote_id            UUID,
  credited_invoice_id UUID REFERENCES invoices(id),
  notes       TEXT,
  footer_text TEXT,
  external_id       TEXT,
  external_provider TEXT,
  external_sync_at  TIMESTAMPTZ,
  external_status   TEXT,
  external_sdi_id   TEXT,
  external_xml_url  TEXT,
  pdf_url          TEXT,
  pdf_generated_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- ════════════════════════════════════════════════════════════════
-- TABELLA 5: Log sincronizzazione con provider
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS billing_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  invoice_id UUID REFERENCES invoices(id),
  provider  TEXT NOT NULL,
  direction TEXT NOT NULL,
  action    TEXT NOT NULL,
  status    TEXT NOT NULL,
  request_payload  JSONB,
  response_payload JSONB,
  error_message    TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
-- FUNZIONE: Genera numero fattura senza race conditions
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION generate_invoice_number(
  p_company_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TABLE(invoice_number TEXT, progressive_number INTEGER) AS $$
DECLARE
  v_next INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(p_company_id::TEXT || p_year::TEXT)
  );
  SELECT COALESCE(MAX(i.progressive_number), 0) + 1
  INTO v_next
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.invoice_year = p_year
    AND i.document_type = 'invoice';
  RETURN QUERY SELECT
    ('FT-' || p_year || '-' || LPAD(v_next::TEXT, 4, '0'))::TEXT,
    v_next;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- FUNZIONE: Ricalcola totali fattura
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION recalculate_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE invoices SET
    subtotal   = COALESCE((SELECT SUM(line_net)   FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    tax_amount = COALESCE((SELECT SUM(line_tax)   FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    total      = COALESCE((SELECT SUM(line_gross) FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalculate_invoice()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_lines_totals ON invoice_lines;
CREATE TRIGGER trg_invoice_lines_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_invoice();

-- ════════════════════════════════════════════════════════════════
-- FUNZIONE: Aggiorna paid_amount e segna come pagata
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_update_paid_amount()
RETURNS TRIGGER AS $$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  UPDATE invoices SET
    paid_amount = COALESCE(
      (SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = v_invoice_id), 0
    ),
    status = CASE
      WHEN COALESCE(
        (SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = v_invoice_id), 0
      ) >= total THEN 'paid'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = v_invoice_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_payments_update ON invoice_payments;
CREATE TRIGGER trg_invoice_payments_update
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION trg_update_paid_amount();

-- ════════════════════════════════════════════════════════════════
-- FUNZIONE RPC: Scadenzario
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_scadenzario(
  p_company_id UUID,
  p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_to_date   DATE DEFAULT CURRENT_DATE + INTERVAL '90 days'
)
RETURNS TABLE (
  invoice_id       UUID,
  invoice_number   TEXT,
  client_name      TEXT,
  due_date         DATE,
  total            NUMERIC,
  paid_amount      NUMERIC,
  remaining        NUMERIC,
  status           TEXT,
  days_until_due   INTEGER,
  urgency          TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.client_company_name,
    i.due_date,
    i.total,
    i.paid_amount,
    (i.total - i.paid_amount) AS remaining,
    i.status,
    (i.due_date - CURRENT_DATE)::INTEGER,
    CASE
      WHEN i.due_date < CURRENT_DATE           THEN 'overdue'
      WHEN i.due_date <= CURRENT_DATE + 7      THEN 'critical'
      WHEN i.due_date <= CURRENT_DATE + 30     THEN 'warning'
      ELSE 'ok'
    END
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('paid', 'cancelled', 'draft')
    AND i.due_date BETWEEN p_from_date AND p_to_date
  ORDER BY i.due_date ASC;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ════════════════════════════════════════════════════════════════
ALTER TABLE billing_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_sync_log      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_billing_integrations" ON billing_integrations
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "company_invoices" ON invoices
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "company_invoice_lines" ON invoice_lines
  FOR ALL USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "company_invoice_payments" ON invoice_payments
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "company_billing_sync_log" ON billing_sync_log
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

-- ════════════════════════════════════════════════════════════════
-- INDICI
-- ════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_invoices_company     ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status      ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_client      ON invoices(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date    ON invoices(company_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_year        ON invoices(company_id, invoice_year, progressive_number);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_inv    ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_inv ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_sync_log_inv ON billing_sync_log(invoice_id);
