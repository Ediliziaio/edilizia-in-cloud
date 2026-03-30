-- RPC to get last access per company (max last_sign_in from auth.users via profiles)
DROP FUNCTION IF EXISTS public.get_company_last_access() CASCADE;
CREATE OR REPLACE FUNCTION public.get_company_last_access()
RETURNS TABLE(company_id uuid, last_access timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.company_id, MAX(u.last_sign_in_at) AS last_access
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id;
$$;
