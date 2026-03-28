-- Aggregate function: total orders value (for admin dashboard)
CREATE OR REPLACE FUNCTION public.get_total_orders_value()
RETURNS TABLE(total_count bigint, total_value numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::bigint, COALESCE(SUM(total_amount), 0)::numeric
  FROM public.orders;
$$;
