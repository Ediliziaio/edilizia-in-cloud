-- Aggregate function: order stats grouped by company (for companies list)
CREATE OR REPLACE FUNCTION public.get_company_order_stats()
RETURNS TABLE(company_id uuid, order_count bigint, total_value numeric, last_order_date timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    o.company_id,
    COUNT(*)::bigint,
    COALESCE(SUM(o.total_amount), 0)::numeric,
    MAX(o.created_at)::timestamptz
  FROM public.orders o
  GROUP BY o.company_id;
$$;
