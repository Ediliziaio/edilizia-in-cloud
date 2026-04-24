-- Sales OS — Sprint 1.1 fix: ensure_sales_os_access usa profiles.company_id
-- Prima usavamo user_roles.company_id ma quella tabella ha solo (user_id, role).
-- La relazione user→company è in profiles.company_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_sales_os_access(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_is_super BOOLEAN;
  v_profile_company UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no session' USING ERRCODE = '42501';
  END IF;

  -- super_admin: accesso totale
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'super_admin'
  ) INTO v_is_super;

  IF v_is_super THEN
    RETURN;
  END IF;

  -- altri ruoli: profile.company_id deve matchare p_company_id
  SELECT company_id INTO v_profile_company
  FROM public.profiles
  WHERE id = v_uid;

  IF v_profile_company IS NULL OR v_profile_company <> p_company_id THEN
    RAISE EXCEPTION 'unauthorized: no access to company %', p_company_id
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_sales_os_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_sales_os_access(UUID) TO authenticated;

COMMIT;
