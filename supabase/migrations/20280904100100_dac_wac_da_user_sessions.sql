-- F1-05 — Aziende attive contate sulle sessioni reali.
-- La dashboard leggeva `audit_log`, tabella inesistente: DAC e WAC restavano
-- a zero per sempre e l'engagement risultava sempre 0%.
CREATE OR REPLACE FUNCTION public.get_active_companies_count(p_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(DISTINCT us.company_id)::int
  FROM public.user_sessions us
  JOIN public.companies c ON c.id = us.company_id
  WHERE us.company_id IS NOT NULL
    AND us.last_active_at >= now() - make_interval(hours => GREATEST(p_hours, 1))
    AND COALESCE(c.is_platform_admin_company, false) = false;
$function$;

REVOKE ALL ON FUNCTION public.get_active_companies_count(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_companies_count(integer) TO authenticated, service_role;
