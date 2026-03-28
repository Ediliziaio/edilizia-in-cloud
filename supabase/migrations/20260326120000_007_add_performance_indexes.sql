CREATE INDEX IF NOT EXISTS idx_company_costs_company ON company_costs(company_id, due_date DESC);
