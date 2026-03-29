-- 10. Function: check_and_update_login_attempt
CREATE OR REPLACE FUNCTION public.check_and_update_login_attempt(
  p_user_id UUID,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
  v_failed_count INT;
  v_max_attempts INT;
  v_company_id UUID;
BEGIN
  -- Get current state
  SELECT p.locked_until, p.failed_login_count, p.company_id
  INTO v_locked_until, v_failed_count, v_company_id
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_not_found');
  END IF;

  -- Check if currently locked
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'account_locked',
      'locked_until', v_locked_until
    );
  END IF;

  -- Get max_failed_attempts from company
  SELECT COALESCE(c.max_failed_attempts, 5) INTO v_max_attempts
  FROM public.companies c
  WHERE c.id = v_company_id;

  v_max_attempts := COALESCE(v_max_attempts, 5);

  IF p_success THEN
    -- Reset counters on success
    UPDATE public.profiles
    SET failed_login_count = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        last_login_ip = p_ip_address
    WHERE id = p_user_id;

    RETURN jsonb_build_object('allowed', true);
  ELSE
    -- Increment failure counter
    v_failed_count := v_failed_count + 1;

    IF v_failed_count >= v_max_attempts THEN
      -- Lock account for 30 minutes
      UPDATE public.profiles
      SET failed_login_count = v_failed_count,
          locked_until = NOW() + INTERVAL '30 minutes'
      WHERE id = p_user_id;

      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'account_locked',
        'locked_until', NOW() + INTERVAL '30 minutes',
        'attempts', v_failed_count
      );
    ELSE
      UPDATE public.profiles
      SET failed_login_count = v_failed_count
      WHERE id = p_user_id;

      RETURN jsonb_build_object(
        'allowed', true,
        'remaining_attempts', v_max_attempts - v_failed_count
      );
    END IF;
  END IF;
END;
$$;
