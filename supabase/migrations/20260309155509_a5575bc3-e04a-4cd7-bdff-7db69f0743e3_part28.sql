CREATE INDEX IF NOT EXISTS idx_invoices_due_date    ON invoices(company_id, due_date) WHERE due_date IS NOT NULL;
