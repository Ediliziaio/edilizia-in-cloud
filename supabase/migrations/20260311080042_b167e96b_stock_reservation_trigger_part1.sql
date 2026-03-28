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
