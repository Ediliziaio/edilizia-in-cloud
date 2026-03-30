DROP FUNCTION IF EXISTS public.release_token_refresh_lock(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.release_token_refresh_lock(p_integration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_integration_id::text));
END;
$$;
