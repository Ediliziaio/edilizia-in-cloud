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
