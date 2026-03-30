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
