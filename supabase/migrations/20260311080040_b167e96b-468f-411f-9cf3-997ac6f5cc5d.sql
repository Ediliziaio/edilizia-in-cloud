
-- Drop old functions
DROP FUNCTION IF EXISTS public.get_blocked_orders(uuid);
DROP FUNCTION IF EXISTS public.get_low_stock_alerts(uuid);
DROP FUNCTION IF EXISTS public.get_order_materials_history(uuid);

-- Add missing columns to warehouse_stock
ALTER TABLE warehouse_stock
  ADD COLUMN IF NOT EXISTS last_delivery_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_lot_number TEXT DEFAULT NULL;

-- Add quantity_available GENERATED column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'warehouse_stock' AND column_name = 'quantity_available'
  ) THEN
    ALTER TABLE warehouse_stock
      ADD COLUMN quantity_available INTEGER GENERATED ALWAYS AS (GREATEST(0, quantity - quantity_reserved)) STORED;
  END IF;
END $$;

-- Reservation trigger
CREATE OR REPLACE FUNCTION trigger_update_stock_reservation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_item_id IS NOT NULL THEN
    IF NEW.status = 'prenotato' AND (OLD.status <> 'prenotato' OR OLD.stock_item_id IS NULL) THEN
      UPDATE warehouse_stock
      SET quantity_reserved = quantity_reserved + NEW.quantity, updated_at = NOW()
      WHERE id = NEW.stock_item_id;
    ELSIF OLD.status = 'prenotato' AND NEW.status <> 'prenotato' AND OLD.stock_item_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity_reserved = GREATEST(0, quantity_reserved - OLD.quantity), updated_at = NOW()
      WHERE id = OLD.stock_item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_reservation_on_status_change ON order_items;
CREATE TRIGGER update_reservation_on_status_change
  AFTER UPDATE OF status, stock_item_id ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_stock_reservation();

-- get_blocked_orders
CREATE FUNCTION get_blocked_orders(p_company_id UUID)
RETURNS TABLE (
  order_id UUID, order_code TEXT, customer_name TEXT, expected_date DATE,
  work_start_date DATE, blocking_items_count BIGINT, missing_items JSONB, urgency_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH blocking AS (
    SELECT oi.order_id, COUNT(oi.id) AS cnt,
      jsonb_agg(jsonb_build_object('item_id', oi.id, 'name', oi.name, 'status', oi.status, 'quantity', oi.quantity, 'delivery_date', oi.delivery_date) ORDER BY oi.status) AS items
    FROM order_items oi WHERE oi.status IN ('da_ordinare', 'ordinato', 'in_arrivo') GROUP BY oi.order_id
  )
  SELECT o.id, o.order_code, p.first_name || ' ' || p.last_name, o.expected_date, o.work_start_date,
    b.cnt, b.items,
    CASE WHEN o.work_start_date <= CURRENT_DATE THEN 'critica' WHEN o.work_start_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'alta' ELSE 'normale' END
  FROM orders o INNER JOIN blocking b ON b.order_id = o.id LEFT JOIN profiles p ON p.id = o.customer_id
  WHERE o.company_id = p_company_id
  ORDER BY CASE WHEN o.work_start_date <= CURRENT_DATE THEN 0 WHEN o.work_start_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1 ELSE 2 END, o.work_start_date NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_low_stock_alerts
CREATE FUNCTION get_low_stock_alerts(p_company_id UUID)
RETURNS TABLE (
  stock_item_id UUID, name TEXT, quantity INTEGER, quantity_reserved INTEGER,
  quantity_available INTEGER, min_stock_level INTEGER, deficit INTEGER, supplier_name TEXT, section_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, ws.name, ws.quantity, ws.quantity_reserved, ws.quantity_available, ws.min_stock_level,
    (ws.min_stock_level - ws.quantity_available), s.name, wsc.name
  FROM warehouse_stock ws LEFT JOIN suppliers s ON s.id = ws.supplier_id LEFT JOIN warehouse_sections wsc ON wsc.id = ws.section_id
  WHERE ws.company_id = p_company_id AND ws.min_stock_level > 0 AND ws.quantity_available < ws.min_stock_level
  ORDER BY (ws.min_stock_level - ws.quantity_available) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_order_materials_history
CREATE FUNCTION get_order_materials_history(p_company_id UUID, p_order_id UUID)
RETURNS TABLE (
  movement_id UUID, stock_item_name TEXT, order_item_name TEXT, movement_type TEXT,
  quantity INTEGER, unit_cost NUMERIC, lot_number TEXT, notes TEXT, performed_by_name TEXT, created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT wm.id, ws.name, oi.name, wm.movement_type, wm.quantity, wm.unit_cost, wm.lot_number, wm.notes,
    p.first_name || ' ' || p.last_name, wm.created_at
  FROM warehouse_movements wm LEFT JOIN warehouse_stock ws ON ws.id = wm.stock_item_id
  LEFT JOIN order_items oi ON oi.id = wm.order_item_id LEFT JOIN profiles p ON p.id = wm.performed_by
  WHERE wm.order_id = p_order_id OR wm.order_item_id IN (SELECT id FROM order_items WHERE order_id = p_order_id)
  ORDER BY wm.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Index
CREATE INDEX IF NOT EXISTS idx_stock_available ON warehouse_stock(company_id, quantity_available);
