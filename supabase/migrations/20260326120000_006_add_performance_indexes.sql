CREATE INDEX IF NOT EXISTS idx_order_installments_order ON order_installments(order_id, expected_date);
