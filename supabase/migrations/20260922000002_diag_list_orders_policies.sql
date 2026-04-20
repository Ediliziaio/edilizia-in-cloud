-- Diagnostic RPC: lista policies e helper correnti per table.
-- Usata una sola volta per localizzare la ricorsione infinita su public.orders.
-- Lettura consentita solo a super_admin e company_admin (niente dati sensibili, solo metadata).

CREATE OR REPLACE FUNCTION public.diag_list_policies(p_table text)
RETURNS TABLE(
  policyname  text,
  cmd         text,
  permissive  text,
  roles       text,
  qual        text,
  with_check  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    policyname::text,
    cmd::text,
    permissive::text,
    array_to_string(roles, ',')::text,
    qual::text,
    with_check::text
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = p_table
  ORDER BY policyname;
$$;

REVOKE ALL ON FUNCTION public.diag_list_policies(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diag_list_policies(text) TO authenticated, service_role;
