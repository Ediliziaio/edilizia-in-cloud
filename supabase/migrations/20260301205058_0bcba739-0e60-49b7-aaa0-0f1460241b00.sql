
CREATE OR REPLACE FUNCTION public.get_feature_usage_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total_companies', (SELECT COUNT(*) FROM public.companies),
    'orders', (SELECT COUNT(DISTINCT company_id) FROM public.orders),
    'calendar', (SELECT COUNT(DISTINCT company_id) FROM public.appointments),
    'employees', (SELECT COUNT(DISTINCT company_id) FROM public.employees),
    'marketing', (SELECT COUNT(DISTINCT company_id) FROM public.email_campaigns)
  );
$$;
