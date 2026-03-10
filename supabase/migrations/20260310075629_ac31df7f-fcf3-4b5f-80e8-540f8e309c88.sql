
DROP FUNCTION IF EXISTS public.superadmin_can_access_company(uuid, uuid);

CREATE OR REPLACE FUNCTION public.superadmin_can_access_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean;
  _ids text[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  ) INTO _is_super;
  
  IF NOT _is_super THEN RETURN false; END IF;
  
  SELECT allowed_company_ids INTO _ids
  FROM public.super_admin_permissions WHERE user_id = _user_id;
  
  -- No record or NULL allowed_company_ids = full access
  IF NOT FOUND OR _ids IS NULL THEN RETURN true; END IF;
  
  RETURN _company_id::text = ANY(_ids);
END;
$$;
