
CREATE OR REPLACE FUNCTION public.get_company_health_data()
RETURNS TABLE(
  company_id uuid,
  order_count bigint,
  orders_last_30d bigint,
  user_count bigint,
  last_order_date timestamptz,
  has_customers boolean,
  has_staff boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    c.id AS company_id,
    COALESCE(os.order_count, 0)::bigint,
    COALESCE(os.orders_last_30d, 0)::bigint,
    COALESCE(uc.user_count, 0)::bigint,
    os.last_order_date,
    COALESCE(cust_check.has_customers, false),
    COALESCE(staff_check.has_staff, false)
  FROM public.companies c
  LEFT JOIN (
    SELECT o.company_id, 
           COUNT(*)::bigint AS order_count,
           COUNT(*) FILTER (WHERE o.created_at >= now() - interval '30 days')::bigint AS orders_last_30d,
           MAX(o.created_at) AS last_order_date
    FROM public.orders o
    GROUP BY o.company_id
  ) os ON os.company_id = c.id
  LEFT JOIN (
    SELECT p.company_id, COUNT(*)::bigint AS user_count
    FROM public.profiles p
    WHERE p.company_id IS NOT NULL
    GROUP BY p.company_id
  ) uc ON uc.company_id = c.id
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur2 
      JOIN public.profiles p2 ON p2.id = ur2.user_id
      WHERE p2.company_id = c.id AND ur2.role = 'customer'
    ) AS has_customers
  ) cust_check ON true
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur3
      JOIN public.profiles p3 ON p3.id = ur3.user_id
      WHERE p3.company_id = c.id AND ur3.role = 'company_staff'
    ) AS has_staff
  ) staff_check ON true;
$$;
