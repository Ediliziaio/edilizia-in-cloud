-- 4. Funzione get_leave_summary
DROP FUNCTION IF EXISTS public.get_leave_summary(uuid, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_leave_summary(
  p_company_id uuid,
  p_year integer DEFAULT NULL
)
RETURNS TABLE (
  employee_id         uuid,
  employee_name       text,
  ferie_days_total    numeric,
  ferie_days_used     numeric,
  ferie_days_remaining numeric,
  permessi_hours_total numeric,
  permessi_hours_used  numeric,
  permessi_hours_remaining numeric,
  rol_hours_total     numeric,
  rol_hours_used      numeric,
  rol_hours_remaining numeric,
  pending_requests    bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id                                AS employee_id,
    e.first_name || ' ' || e.last_name  AS employee_name,
    COALESCE(lb.ferie_days_total, 0),
    COALESCE(lb.ferie_days_used, 0),
    GREATEST(0, COALESCE(lb.ferie_days_total, 0) - COALESCE(lb.ferie_days_used, 0)),
    COALESCE(lb.permessi_hours_total, 0),
    COALESCE(lb.permessi_hours_used, 0),
    GREATEST(0, COALESCE(lb.permessi_hours_total, 0) - COALESCE(lb.permessi_hours_used, 0)),
    COALESCE(lb.rol_hours_total, 0),
    COALESCE(lb.rol_hours_used, 0),
    GREATEST(0, COALESCE(lb.rol_hours_total, 0) - COALESCE(lb.rol_hours_used, 0)),
    COUNT(lr.id) FILTER (WHERE lr.status = 'pending')
  FROM public.employees e
  LEFT JOIN public.leave_balances lb ON lb.employee_id = e.id
    AND lb.company_id = p_company_id
    AND lb.year = COALESCE(p_year, EXTRACT(YEAR FROM now())::integer)
  LEFT JOIN public.leave_requests lr ON lr.employee_id = e.id
    AND lr.company_id = p_company_id
    AND lr.status = 'pending'
  WHERE e.company_id = p_company_id
    AND e.is_active = true
    AND e.role_type IN ('operaio', 'staff_interno')
  GROUP BY e.id, e.first_name, e.last_name, lb.ferie_days_total,
    lb.ferie_days_used, lb.permessi_hours_total, lb.permessi_hours_used,
    lb.rol_hours_total, lb.rol_hours_used
  ORDER BY e.first_name, e.last_name;
$$;
