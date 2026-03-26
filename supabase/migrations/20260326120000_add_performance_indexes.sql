-- Performance indexes for high-traffic queries
CREATE INDEX IF NOT EXISTS idx_orders_company_created ON orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders(company_id, status_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_company_status ON scadenze(company_id, status);
CREATE INDEX IF NOT EXISTS idx_scadenze_company_due ON scadenze(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_prima_nota_company_date ON prima_nota_entries(company_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_company ON order_items(company_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_installments_company_due ON order_installments(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_company_costs_company_date ON company_costs(company_id, cost_date DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_created ON tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_created ON marketing_contacts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
