-- Auto-cleanup: delete entries older than 1 hour
DROP FUNCTION IF EXISTS public.cleanup_rate_limits() CASCADE;
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.edge_function_rate_limits
  WHERE called_at < now() - interval '1 hour';
$$;
