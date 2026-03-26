-- Performance indexes for high-traffic queries (verified column names)
CREATE INDEX IF NOT EXISTS idx_orders_company_created ON orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders(company_id, current_status_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_company_status ON scadenze(company_id, status);
CREATE INDEX IF NOT EXISTS idx_scadenze_company_due ON scadenze(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_prima_nota_company_date ON prima_nota_entries(company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_installments_order ON order_installments(order_id, expected_date);
CREATE INDEX IF NOT EXISTS idx_company_costs_company ON company_costs(company_id, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_created ON tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_created ON marketing_contacts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
