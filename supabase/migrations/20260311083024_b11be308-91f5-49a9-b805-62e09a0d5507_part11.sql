CREATE INDEX IF NOT EXISTS idx_sales_targets_lookup
  ON sales_targets(company_id, year, month);
