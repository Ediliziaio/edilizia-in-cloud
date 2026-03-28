-- ════════════════════════════════════════════════════════════════
-- INDICI
-- ════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_invoices_company     ON invoices(company_id);
