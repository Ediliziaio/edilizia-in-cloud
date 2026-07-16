-- RENDER VERTICALI — Protezione soldi GENERICA per i 7 verticali rimanenti
-- (stanza, pavimento, facciata, persiane, tetto, pergole, piscine).
-- Audit 16/07: tutti clonano lo stesso skeleton con gli stessi bug già
-- fixati su infissi/bagno: guard read-then-act (doppio deduct possibile),
-- nessuno sweeper (isolate morta = credito perso per sempre).
--
--  1) claim_render_vertical_session(_table, _session_id, _stale_seconds):
--     claim atomico con whitelist tabelle + SQL dinamico. Le 7 tabelle sono
--     uniformi: status ('processing'/'completed'/'failed'),
--     processing_started_at, processing_completed_at, company_id, created_by.
--  2) release_render_vertical_session(_table, _session_id)
--  3) sweep_stuck_render_sessions(): esteso a TUTTE le tabelle verticali —
--     processing >5min → failed + refund_render_credit_all + campanella.

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
    'render_tetto_sessions','render_pergole_sessions','render_piscine_sessions'
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

REVOKE EXECUTE ON FUNCTION public.claim_render_vertical_session(text, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_vertical_session(text, uuid, integer) TO service_role;

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
    'render_tetto_sessions','render_pergole_sessions','render_piscine_sessions'
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

REVOKE EXECUTE ON FUNCTION public.release_render_vertical_session(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_render_vertical_session(text, uuid) TO service_role;

-- ── Sweeper esteso a TUTTI i verticali ──────────────────────────────────────
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
    'render_tetto_sessions','render_pergole_sessions','render_piscine_sessions'
  ];
  r record;
BEGIN
  -- 1) Infissi (render_sessions: anche i pending col credito scalato)
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

  -- 2) Bagno (tabella con stati in italiano, niente created_by)
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

  -- 3) Gli altri 7 verticali (schema uniforme in inglese, con created_by)
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

REVOKE EXECUTE ON FUNCTION public.sweep_stuck_render_sessions() FROM public, anon, authenticated;
