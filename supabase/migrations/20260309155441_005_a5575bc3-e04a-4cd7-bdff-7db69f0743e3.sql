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
