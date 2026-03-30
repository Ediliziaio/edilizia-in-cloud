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
