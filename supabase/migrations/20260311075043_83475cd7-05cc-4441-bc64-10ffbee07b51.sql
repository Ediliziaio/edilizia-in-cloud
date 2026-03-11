
-- MG1b: RPCs and triggers

CREATE OR REPLACE FUNCTION public.get_blocked_orders(p_company_id uuid)
RETURNS TABLE(order_id uuid, order_code text, customer_name text, expected_date date, total_items bigint, missing_items bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT o.id, o.order_code, mc.first_name || ' ' || mc.last_name,
    o.expected_date::date, COUNT(oi.id), COUNT(oi.id) FILTER (WHERE oi.status IN ('da_ordinare','ordinato'))
  FROM orders o
  JOIN marketing_contacts mc ON mc.id = o.customer_id
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.company_id = p_company_id AND o.expected_date IS NOT NULL
    AND o.expected_date::date <= (CURRENT_DATE + interval '14 days')
  GROUP BY o.id, o.order_code, mc.first_name, mc.last_name, o.expected_date
  HAVING COUNT(oi.id) FILTER (WHERE oi.status IN ('da_ordinare','ordinato')) > 0
  ORDER BY o.expected_date ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_low_stock_alerts(p_company_id uuid)
RETURNS TABLE(stock_item_id uuid, item_name text, current_quantity integer, reserved integer, available integer, min_level integer, reorder_qty integer, supplier_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT ws.id, ws.name, ws.quantity, ws.quantity_reserved,
    (ws.quantity - ws.quantity_reserved), ws.min_stock_level, ws.reorder_quantity, ws.supplier_id
  FROM warehouse_stock ws
  WHERE ws.company_id = p_company_id AND (ws.quantity - ws.quantity_reserved) <= ws.min_stock_level
  ORDER BY (ws.quantity - ws.quantity_reserved) ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_order_materials_history(p_order_id uuid)
RETURNS TABLE(movement_id uuid, stock_item_name text, movement_type text, quantity integer, lot_number text, notes text, performed_by uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT wm.id, ws.name, wm.movement_type, wm.quantity, wm.lot_number, wm.notes, wm.performed_by, wm.created_at
  FROM warehouse_movements wm
  JOIN warehouse_stock ws ON ws.id = wm.stock_item_id
  JOIN order_items oi ON oi.id = wm.order_item_id
  WHERE oi.order_id = p_order_id
  ORDER BY wm.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.trg_auto_deduct_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'installato' AND OLD.status IS DISTINCT FROM 'installato'
     AND NEW.auto_deducted IS NOT TRUE AND NEW.stock_item_id IS NOT NULL THEN
    UPDATE warehouse_stock SET quantity = GREATEST(quantity - COALESCE(NEW.quantity,1), 0), updated_at = now() WHERE id = NEW.stock_item_id;
    INSERT INTO warehouse_movements (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id)
    VALUES (NEW.stock_item_id, NEW.id, 'scarico', COALESCE(NEW.quantity,1), 'Scarico automatico a installazione',
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'), NEW.order_id);
    NEW.auto_deducted := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_auto_deduct ON public.order_items;
CREATE TRIGGER trg_order_item_auto_deduct BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.trg_auto_deduct_stock();
