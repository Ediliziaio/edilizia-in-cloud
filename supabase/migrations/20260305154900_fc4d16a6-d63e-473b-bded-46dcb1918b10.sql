
-- Index for salesperson_id filtering
CREATE INDEX IF NOT EXISTS idx_profiles_salesperson_id ON public.profiles (salesperson_id);

-- RPC function for server-side paginated customers
CREATE OR REPLACE FUNCTION public.get_customers_paginated(
  p_company_id UUID,
  p_search TEXT DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_salesperson_none BOOLEAN DEFAULT FALSE,
  p_has_orders TEXT DEFAULT 'all',
  p_sort_field TEXT DEFAULT 'name',
  p_sort_dir TEXT DEFAULT 'asc',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 25
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  WITH customer_base AS (
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.email,
      p.phone,
      p.fiscal_code,
      p.address,
      p.site_address,
      p.notes,
      p.created_at,
      p.salesperson_id,
      COALESCE(oc.order_count, 0)::int AS order_count
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
    LEFT JOIN (
      SELECT customer_id, COUNT(*)::int AS order_count
      FROM public.orders
      WHERE company_id = p_company_id
      GROUP BY customer_id
    ) oc ON oc.customer_id = p.id
    WHERE p.company_id = p_company_id
      -- Search filter
      AND (
        p_search IS NULL OR p_search = '' OR
        p.first_name ILIKE '%' || p_search || '%' OR
        p.last_name ILIKE '%' || p_search || '%' OR
        p.email ILIKE '%' || p_search || '%' OR
        p.phone ILIKE '%' || p_search || '%' OR
        p.fiscal_code ILIKE '%' || p_search || '%'
      )
      -- Salesperson filter
      AND (
        (p_salesperson_id IS NULL AND p_salesperson_none = FALSE)
        OR (p_salesperson_none = TRUE AND p.salesperson_id IS NULL)
        OR (p_salesperson_id IS NOT NULL AND p.salesperson_id = p_salesperson_id)
      )
      -- Orders filter
      AND (
        p_has_orders = 'all'
        OR (p_has_orders = 'with' AND COALESCE(oc.order_count, 0) > 0)
        OR (p_has_orders = 'without' AND COALESCE(oc.order_count, 0) = 0)
      )
  ),
  total AS (
    SELECT COUNT(*)::int AS total_count FROM customer_base
  )
  SELECT json_build_object(
    'rows', COALESCE((
      SELECT json_agg(row_data)
      FROM (
        SELECT cb.*
        FROM customer_base cb
        ORDER BY
          CASE WHEN p_sort_field = 'name' AND p_sort_dir = 'asc' THEN cb.first_name || ' ' || cb.last_name END ASC,
          CASE WHEN p_sort_field = 'name' AND p_sort_dir = 'desc' THEN cb.first_name || ' ' || cb.last_name END DESC,
          CASE WHEN p_sort_field = 'created_at' AND p_sort_dir = 'asc' THEN cb.created_at END ASC,
          CASE WHEN p_sort_field = 'created_at' AND p_sort_dir = 'desc' THEN cb.created_at END DESC
        LIMIT p_limit
        OFFSET p_offset
      ) row_data
    ), '[]'::json),
    'total_count', (SELECT total_count FROM total)
  ) INTO result;

  RETURN result;
END;
$$;
