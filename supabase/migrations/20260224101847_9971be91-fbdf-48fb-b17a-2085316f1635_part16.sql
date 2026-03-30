-- Create RPC function for plan count aggregation
DROP FUNCTION IF EXISTS public.get_plan_company_counts() CASCADE;
CREATE OR REPLACE FUNCTION public.get_plan_company_counts()
RETURNS TABLE(subscription_plan_id uuid, company_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.subscription_plan_id, COUNT(*)::bigint
  FROM public.companies c
  WHERE c.subscription_plan_id IS NOT NULL
  GROUP BY c.subscription_plan_id;
$$;
