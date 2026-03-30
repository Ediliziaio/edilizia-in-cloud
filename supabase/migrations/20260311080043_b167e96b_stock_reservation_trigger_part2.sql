-- get_order_materials_history
DROP FUNCTION IF EXISTS public.get_order_materials_history(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION get_order_materials_history(p_company_id UUID, p_order_id UUID)
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
