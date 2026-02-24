
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

-- Aggregate function: user counts grouped by company (for companies list)
CREATE OR REPLACE FUNCTION public.get_company_user_counts()
RETURNS TABLE(company_id uuid, user_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    p.company_id,
    COUNT(*)::bigint
  FROM public.profiles p
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id;
$$;
