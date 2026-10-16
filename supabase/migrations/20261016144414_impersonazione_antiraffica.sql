-- Versione allineata alla migrazione applicata sul progetto.
-- Nessuna quota oraria. Solo gli avvii ravvicinati condividono un budget
-- atomico (anche fra istanze Edge); validate/end non lo consumano.
CREATE OR REPLACE FUNCTION public.impersonation_start_burst(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '2s'
SET lock_timeout = '250ms'
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_first timestamptz;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '22023';
  END IF;
  -- Non accodare connessioni se più schede cliccano contemporaneamente.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('impersonation-burst:' || p_admin_id::text, 0)
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', 1);
  END IF;
  SELECT count(*), min(called_at) INTO v_count, v_first
  FROM (
    SELECT called_at FROM public.edge_function_rate_limits
    WHERE function_name = 'secure-impersonation-start'
      AND caller_id = p_admin_id::text
      AND called_at > v_now - interval '10 seconds'
    ORDER BY called_at DESC LIMIT 10
  ) recent;
  IF v_count >= 10 THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds',
      least(10, greatest(1, ceil(extract(epoch FROM v_first + interval '10 seconds' - v_now))::integer)));
  END IF;
  INSERT INTO public.edge_function_rate_limits(function_name, caller_id, called_at)
  VALUES ('secure-impersonation-start', p_admin_id::text, v_now);
  RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.impersonation_start_burst(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.impersonation_start_burst(uuid) TO service_role;
