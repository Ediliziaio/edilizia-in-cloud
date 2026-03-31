-- Migration: RLS audit RPC function
-- Returns all public tables with RLS enabled status and active policy count

CREATE OR REPLACE FUNCTION public.get_full_rls_audit()
RETURNS TABLE(
  table_name  text,
  rls_enabled boolean,
  policy_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    t.tablename::text         AS table_name,
    t.rowsecurity             AS rls_enabled,
    COUNT(p.policyname)       AS policy_count
  FROM pg_tables t
  LEFT JOIN pg_policies p
    ON t.tablename = p.tablename
   AND p.schemaname = 'public'
  WHERE t.schemaname = 'public'
  GROUP BY t.tablename, t.rowsecurity
  ORDER BY t.tablename;
$$;

-- Only super_admin/service_role should call this RPC
REVOKE ALL ON FUNCTION public.get_full_rls_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_full_rls_audit() TO service_role;
