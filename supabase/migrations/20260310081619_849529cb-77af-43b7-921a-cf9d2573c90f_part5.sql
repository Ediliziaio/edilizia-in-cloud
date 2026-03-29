CREATE OR REPLACE FUNCTION public.staff_update_own_password_flag(
  _must_change boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.staff_permissions 
  SET must_change_password = _must_change
  WHERE user_id = auth.uid();
END;
$$;
