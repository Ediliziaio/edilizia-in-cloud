-- Index
CREATE INDEX IF NOT EXISTS idx_stock_available ON warehouse_stock(company_id, quantity_available);
