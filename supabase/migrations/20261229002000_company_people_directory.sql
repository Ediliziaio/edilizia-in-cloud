-- Centralized people directory RPCs.
-- Keep role resolution on the database side so browser RLS on user_roles does
-- not make company pickers empty or inconsistent.

CREATE OR REPLACE FUNCTION public.can_access_company_people(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_company_people(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.get_internal_chat_profiles(UUID);

CREATE OR REPLACE FUNCTION public.get_internal_chat_profiles(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  avatar_url TEXT,
  roles TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.avatar_url,
    array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) AS roles
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.company_id = p_company_id
    AND public.can_access_company_people(p_company_id)
    AND ur.role IN (
      'company_admin'::public.app_role,
      'company_staff'::public.app_role,
      'salesperson'::public.app_role,
      'call_center'::public.app_role,
      'employee'::public.app_role,
      'worker'::public.app_role,
      'subcontractor'::public.app_role,
      'super_admin'::public.app_role
    )
  GROUP BY p.id, p.first_name, p.last_name, p.email, p.avatar_url
  ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST, p.email;
$$;

GRANT EXECUTE ON FUNCTION public.get_internal_chat_profiles(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_company_customers(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id,
    p.first_name,
    p.last_name,
    p.email
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.company_id = p_company_id
    AND public.can_access_company_people(p_company_id)
    AND ur.role = 'customer'::public.app_role
  ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST, p.email;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_customers(UUID) TO authenticated;
