
-- RPC to list public tables without RLS enabled
DROP FUNCTION IF EXISTS public.get_tables_without_rls() CASCADE;
CREATE OR REPLACE FUNCTION public.get_tables_without_rls()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.relname::text AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = false
  ORDER BY c.relname;
$$;
