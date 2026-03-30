-- RPC to get monthly order counts for sparklines (last 6 months per company)
DROP FUNCTION IF EXISTS public.get_company_order_sparklines() CASCADE;
CREATE OR REPLACE FUNCTION public.get_company_order_sparklines()
RETURNS TABLE(company_id uuid, month_key text, order_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.company_id, 
         to_char(o.created_at, 'YYYY-MM') AS month_key,
         COUNT(*)::bigint AS order_count
  FROM public.orders o
  WHERE o.created_at >= (now() - interval '6 months')
  GROUP BY o.company_id, to_char(o.created_at, 'YYYY-MM')
  ORDER BY o.company_id, month_key;
$$;
