-- Create helper function for staff visibility check
CREATE OR REPLACE FUNCTION public.check_staff_visibility(_user_id uuid, _assigned_to uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _only_assigned boolean;
BEGIN
  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  SELECT only_assigned INTO _only_assigned
  FROM public.staff_permissions
  WHERE user_id = _user_id;

  IF _only_assigned IS NULL OR _only_assigned = false THEN
    RETURN true;
  END IF;

  RETURN _assigned_to = _user_id;
END;
$$;
