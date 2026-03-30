-- BUG 3: Add exception handler to has_permission() to prevent SQL errors
-- when a permission column doesn't exist (e.g., after schema changes or new columns)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_perm boolean;
BEGIN
  -- Super admin and company admin have all permissions
  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Check if user is company_staff (or salesperson/call_center which also have company_staff)
  IF NOT has_role(_user_id, 'company_staff'::app_role) THEN
    RETURN false;
  END IF;

  -- Validate that the permission column exists before querying to avoid SQL exceptions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_permissions'
      AND column_name = _permission
  ) THEN
    RETURN false;
  END IF;

  -- Get specific permission
  BEGIN
    EXECUTE format(
      'SELECT %I FROM public.staff_permissions WHERE user_id = $1',
      _permission
    ) INTO _has_perm USING _user_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN COALESCE(_has_perm, false);
END;
$$;
