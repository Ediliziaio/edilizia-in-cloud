DROP FUNCTION IF EXISTS public.get_low_stock_alerts(uuid) CASCADE;
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
