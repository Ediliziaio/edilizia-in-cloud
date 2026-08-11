-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Estende claim/release/sweeper a render_technical_sessions (10ª edge:
-- ristrutturazioni, giardini, porte, pavimenti esterni — stesso skeleton).

CREATE OR REPLACE FUNCTION public.claim_render_vertical_session(
  _table         text,
  _session_id    uuid,
  _stale_seconds integer DEFAULT 170
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed constant text[] := ARRAY[
    'render_stanza_sessions','render_pavimento_sessions',
    'render_facciata_sessions','render_persiane_sessions',
    'render_tetto_sessions','render_pergole_sessions','render_piscine_sessions',
    'render_technical_sessions'
  ];
  v_status text;
  v_started timestamptz;
  v_stale boolean := false;
BEGIN
  IF NOT (_table = ANY(v_allowed)) THEN
    RETURN json_build_object('claimed', false, 'reason', 'table_not_allowed');
  END IF;

  EXECUTE format(
    'SELECT status, processing_started_at FROM public.%I WHERE id = $1 FOR UPDATE',
    _table
  ) INTO v_status, v_started USING _session_id;

  IF NOT FOUND THEN
    RETURN json_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF v_status = 'completed' THEN
    RETURN json_build_object('claimed', false, 'reason', 'completed');
  END IF;

  IF v_status = 'processing' THEN
    v_stale := v_started IS NULL
      OR v_started < now() - make_interval(secs => _stale_seconds);
    IF NOT v_stale THEN
      RETURN json_build_object('claimed', false, 'reason', 'in_flight');
    END IF;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET status = ''processing'', processing_started_at = now() WHERE id = $1',
    _table
  ) USING _session_id;

  RETURN json_build_object(
    'claimed', true,
    'prev_status', v_status,
    'stale_takeover', (v_status = 'processing' AND v_stale)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_render_vertical_session(
  _table       text,
  _session_id  uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed constant text[] := ARRAY[
    'render_stanza_sessions','render_pavimento_sessions',
    'render_facciata_sessions','render_persiane_sessions',
    'render_tetto_sessions','render_pergole_sessions','render_piscine_sessions',
    'render_technical_sessions'
  ];
BEGIN
  IF NOT (_table = ANY(v_allowed)) THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'UPDATE public.%I SET status = ''pending'', processing_started_at = NULL WHERE id = $1 AND status = ''processing''',
    _table
  ) USING _session_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.sweep_stuck_render_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_table text;
  v_has_error_col boolean;
  v_verticals constant text[] := ARRAY[
    'render_stanza_sessions','render_pavimento_sessions',
    'render_facciata_sessions','render_persiane_sessions',
    'render_tetto_sessions','render_pergole_sessions','render_piscine_sessions',
    'render_technical_sessions'
  ];
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

  FOREACH v_table IN ARRAY v_verticals LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table
        AND column_name = 'error_message'
    ) INTO v_has_error_col;

    FOR r IN EXECUTE format(
      'SELECT id, company_id, created_by FROM public.%I
       WHERE status = ''processing''
         AND processing_started_at < now() - interval ''5 minutes''
       FOR UPDATE SKIP LOCKED', v_table)
    LOOP
      IF v_has_error_col THEN
        EXECUTE format(
          'UPDATE public.%I SET status = ''failed'', processing_completed_at = now(),
             error_message = ''Render interrotto dal sistema per timeout. Il credito è stato rimborsato automaticamente: riprova quando vuoi.''
           WHERE id = $1', v_table
        ) USING r.id;
      ELSE
        EXECUTE format(
          'UPDATE public.%I SET status = ''failed'', processing_completed_at = now() WHERE id = $1',
          v_table
        ) USING r.id;
      END IF;

      BEGIN
        PERFORM public.refund_render_credit_all(
          r.company_id, r.id,
          jsonb_build_object('source', 'sweep_stuck_render_sessions', 'vertical', v_table)
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'sweep: refund fallito per sessione % di % (%)', r.id, v_table, SQLERRM;
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
  END LOOP;

  RETURN v_count;
END;
$$;
