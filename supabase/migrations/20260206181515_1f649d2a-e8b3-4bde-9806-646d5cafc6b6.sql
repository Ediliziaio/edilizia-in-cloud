-- 1. Nuovi campi finanziari per orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_2_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS financing_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'standard';

-- 2. Nuova tabella order_items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'da_ordinare',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS policies per order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their order items"
  ON order_items FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
      SELECT 1 FROM orders o 
      WHERE o.id = order_items.order_id 
      AND o.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Customers can view their order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o 
      WHERE o.id = order_items.order_id 
      AND o.customer_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can manage all order items"
  ON order_items FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- 4. Trigger per updated_at
CREATE TRIGGER update_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();