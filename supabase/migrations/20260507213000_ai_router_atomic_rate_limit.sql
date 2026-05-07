-- Atomic rate limiter for central AI router / OpenRouter calls.
-- Uses existing edge_function_rate_limits table but avoids the old count-then-insert
-- race condition with a transaction-scoped advisory lock.

CREATE OR REPLACE FUNCTION public.check_ai_router_rate_limit(
  p_function_name text,
  p_caller_id text,
  p_max_calls int,
  p_window_seconds int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_current_count int := 0;
  v_remaining int := 0;
  v_lock_key bigint;
BEGIN
  IF p_function_name IS NULL OR length(trim(p_function_name)) = 0 THEN
    RAISE EXCEPTION 'function_name_required';
  END IF;

  IF p_caller_id IS NULL OR length(trim(p_caller_id)) = 0 THEN
    RAISE EXCEPTION 'caller_id_required';
  END IF;

  IF COALESCE(p_max_calls, 0) <= 0 OR COALESCE(p_window_seconds, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', 999999,
      'retry_after_seconds', 0
    );
  END IF;

  v_window_start := v_now - make_interval(secs => p_window_seconds);
  v_lock_key := hashtextextended(p_function_name || ':' || p_caller_id, 0);

  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*)::int
    INTO v_current_count
  FROM public.edge_function_rate_limits
  WHERE function_name = p_function_name
    AND caller_id = p_caller_id
    AND called_at >= v_window_start;

  IF v_current_count >= p_max_calls THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after_seconds', p_window_seconds,
      'current_count', v_current_count,
      'limit', p_max_calls
    );
  END IF;

  INSERT INTO public.edge_function_rate_limits(function_name, caller_id, called_at)
  VALUES (p_function_name, p_caller_id, v_now);

  v_remaining := GREATEST(0, p_max_calls - v_current_count - 1);

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_remaining,
    'retry_after_seconds', 0,
    'current_count', v_current_count + 1,
    'limit', p_max_calls
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_router_rate_limit(text, text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_router_rate_limit(text, text, int, int) TO service_role;

COMMENT ON FUNCTION public.check_ai_router_rate_limit(text, text, int, int) IS
  'Atomic advisory-lock rate limiter for AI router buckets (global/company/user/company_task). Service role only.';
