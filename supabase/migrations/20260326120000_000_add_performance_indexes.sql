-- Performance indexes for high-traffic queries (verified column names)
CREATE INDEX IF NOT EXISTS idx_orders_company_created ON orders(company_id, created_at DESC);
