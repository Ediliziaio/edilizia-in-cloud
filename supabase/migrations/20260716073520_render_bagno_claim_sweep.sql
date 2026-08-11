-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.claim_render_bagno_session(
  _session_id    uuid,
  _stale_seconds integer DEFAULT 170
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stato text;
  v_started timestamptz;
  v_stale boolean := false;
BEGIN
  SELECT stato, processing_started_at
  INTO v_stato, v_started
  FROM render_bagno_sessions
  WHERE id = _session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF v_stato = 'completato' THEN
    RETURN json_build_object('claimed', false, 'reason', 'completed');
  END IF;

  IF v_stato = 'processing' THEN
    v_stale := v_started IS NULL
      OR v_started < now() - make_interval(secs => _stale_seconds);
    IF NOT v_stale THEN
      RETURN json_build_object('claimed', false, 'reason', 'in_flight');
    END IF;
  END IF;

  UPDATE render_bagno_sessions
  SET stato = 'processing',
      processing_started_at = now()
  WHERE id = _session_id;

  RETURN json_build_object(
    'claimed', true,
    'prev_stato', v_stato,
    'stale_takeover', (v_stato = 'processing' AND v_stale)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_render_bagno_session(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_bagno_session(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_render_bagno_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE render_bagno_sessions
  SET stato = 'analysis_done', processing_started_at = NULL
  WHERE id = _session_id AND stato = 'processing'
  RETURNING true;
$$;

REVOKE EXECUTE ON FUNCTION public.release_render_bagno_session(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_render_bagno_session(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sweep_stuck_render_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT rs.id, rs.company_id, rs.created_by
    FROM render_sessions rs
    WHERE
      (rs.status = 'processing'
        AND rs.processing_started_at < now() - interval '5 minutes')
      OR (rs.status = 'pending'
        AND rs.created_at < now() - interval '15 minutes'
        AND EXISTS (
          SELECT 1 FROM render_credit_ledger l
          WHERE l.session_id = rs.id AND l.reason = 'consume')
        AND (
          SELECT count(*) FROM render_credit_ledger l
          WHERE l.session_id = rs.id AND l.reason = 'consume'
        ) > (
          SELECT count(*) FROM render_credit_ledger l
          WHERE l.session_id = rs.id AND l.reason = 'refund'
        ))
    FOR UPDATE OF rs SKIP LOCKED
  LOOP
    UPDATE render_sessions
    SET status = 'failed',
        processing_completed_at = now(),
        error_message = 'Render interrotto dal sistema per timeout. Il credito è stato rimborsato automaticamente: riprova quando vuoi.'
    WHERE id = r.id;

    BEGIN
      PERFORM public.refund_render_credit_all(
        r.company_id, r.id,
        jsonb_build_object('source', 'sweep_stuck_render_sessions')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sweep: refund fallito per sessione infissi % (%)', r.id, SQLERRM;
    END;

    IF r.created_by IS NOT NULL THEN
      BEGIN
        INSERT INTO notifications (
          company_id, user_id, type, title, body,
          entity_type, entity_id, action_url, is_read, is_dismissed
        ) VALUES (
          r.company_id, r.created_by, 'render_failed',
          'Render interrotto — credito rimborsato',
          'Un render è andato in timeout ed è stato interrotto. Il credito è già tornato sul tuo saldo: puoi riprovare subito.',
          'render_session', r.id, '/azienda/render', false, false
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  FOR r IN
    SELECT rb.id, rb.company_id
    FROM render_bagno_sessions rb
    WHERE rb.stato = 'processing'
      AND rb.processing_started_at < now() - interval '5 minutes'
    FOR UPDATE OF rb SKIP LOCKED
  LOOP
    UPDATE render_bagno_sessions
    SET stato = 'errore',
        processing_completed_at = now()
    WHERE id = r.id;

    BEGIN
      PERFORM public.refund_render_credit_all(
        r.company_id, r.id,
        jsonb_build_object('source', 'sweep_stuck_render_sessions', 'vertical', 'bagno')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sweep: refund fallito per sessione bagno % (%)', r.id, SQLERRM;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_stuck_render_sessions() FROM public, anon, authenticated;
