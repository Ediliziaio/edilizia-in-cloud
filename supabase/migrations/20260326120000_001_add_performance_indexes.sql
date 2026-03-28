CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders(company_id, current_status_id);
