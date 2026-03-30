-- Helper function for efficient company_id lookups in RLS
DROP FUNCTION IF EXISTS public.get_my_company_id() CASCADE;
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;
