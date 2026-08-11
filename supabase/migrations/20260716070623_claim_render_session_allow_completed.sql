-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DROP FUNCTION IF EXISTS public.claim_render_session(uuid, integer);

CREATE OR REPLACE FUNCTION public.claim_render_session(
  _session_id      uuid,
  _stale_seconds   integer DEFAULT 170,
  _allow_completed boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_started timestamptz;
  v_stale boolean := false;
BEGIN
  SELECT status, processing_started_at
  INTO v_status, v_started
  FROM render_sessions
  WHERE id = _session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF v_status = 'completed' AND NOT _allow_completed THEN
    RETURN json_build_object('claimed', false, 'reason', 'completed');
  END IF;

  IF v_status = 'processing' THEN
    v_stale := v_started IS NULL
      OR v_started < now() - make_interval(secs => _stale_seconds);
    IF NOT v_stale THEN
      RETURN json_build_object(
        'claimed', false,
        'reason', 'in_flight',
        'age_sec', GREATEST(0, floor(extract(epoch FROM (now() - v_started))))::int
      );
    END IF;
  END IF;

  UPDATE render_sessions
  SET status = 'processing',
      processing_started_at = now(),
      error_message = NULL
  WHERE id = _session_id;

  RETURN json_build_object(
    'claimed', true,
    'prev_status', v_status,
    'stale_takeover', (v_status = 'processing' AND v_stale)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_render_session(uuid, integer, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_session(uuid, integer, boolean) TO service_role;
