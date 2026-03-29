CREATE INDEX IF NOT EXISTS idx_invoices_year        ON invoices(company_id, invoice_year, progressive_number);
