-- get_blocked_orders
DROP FUNCTION IF EXISTS public.get_blocked_orders(UUID) CASCADE;
CREATE OR REPLACE FUNCTION get_blocked_orders(p_company_id UUID)
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
