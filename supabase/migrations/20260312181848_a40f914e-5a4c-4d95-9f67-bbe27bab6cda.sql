
CREATE OR REPLACE FUNCTION public.try_acquire_token_refresh_lock(p_integration_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN pg_try_advisory_lock(hashtext(p_integration_id::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.release_token_refresh_lock(p_integration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_integration_id::text));
END;
$$;
