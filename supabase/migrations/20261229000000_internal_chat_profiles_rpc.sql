-- Internal chat directory: return only company people, never customers.
-- `user_roles` is intentionally not broadly readable from the browser, so the
-- chat user picker must be resolved server-side through a SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.get_internal_chat_profiles(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  avatar_url TEXT
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
    p.email,
    p.avatar_url
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.company_id = p_company_id
    AND (
      p_company_id = public.get_user_company_id(auth.uid())
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
    AND ur.role IN (
      'company_admin'::public.app_role,
      'company_staff'::public.app_role,
      'salesperson'::public.app_role,
      'call_center'::public.app_role,
      'employee'::public.app_role,
      'subcontractor'::public.app_role,
      'super_admin'::public.app_role
    )
  ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST, p.email;
$$;

GRANT EXECUTE ON FUNCTION public.get_internal_chat_profiles(UUID) TO authenticated;
