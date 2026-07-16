-- ═══════════════════════════════════════════════════════════════════════════
-- RENDER F1 — Percorso del denaro blindato (audit render infissi 16/07/2026)
--
--  1) claim_render_session  : presa in carico ATOMICA della sessione.
--     Chiude il race "doppio click / due tab → doppio deduct": il lock
--     FOR UPDATE serializza, solo la prima invocation ottiene il claim,
--     la seconda riceve claimed=false e l'edge risponde 409.
--     Il claim avviene PRIMA del deduct credito (ordine invertito rispetto
--     a prima, dove il guard non-atomico stava tra load e update).
--
--  2) release_render_session: rilascio del claim se il deduct fallisce
--     (crediti insufficienti) → la sessione torna 'pending' e l'utente
--     può riprovare dopo la ricarica.
--
--  3) refund_render_credit_all: rimborsa TUTTI i consume non ancora
--     rimborsati di una sessione. refund_render_credit_v1 rimborsa solo
--     l'ultimo e si blocca se esiste già un refund → le sessioni con
--     takeover (retry dopo isolate morta) perdevano 1 credito.
--
--  4) sweep_stuck_render_sessions + pg_cron ogni 5 minuti: le sessioni
--     'processing' morte (isolate killata: cap 150s, OOM, deploy) vengono
--     marcate 'failed', il credito rimborsato, l'utente avvisato in
--     campanella. Prima restavano 'processing' PER SEMPRE a credito perso
--     (15 casi reali in produzione).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) CLAIM ATOMICO ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_render_session(
  _session_id    uuid,
  _stale_seconds integer DEFAULT 170
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
  -- Lock riga: serializza le invocation concorrenti sulla stessa sessione.
  SELECT status, processing_started_at
  INTO v_status, v_started
  FROM render_sessions
  WHERE id = _session_id
  FOR UPDATE;

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
    -- true = presa in carico di un tentativo morto: l'edge deve rimborsare
    -- il consume orfano PRIMA del nuovo deduct (altrimenti 2 consume, 1 render).
    'stale_takeover', (v_status = 'processing' AND v_stale)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_render_session(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_session(uuid, integer) TO service_role;

-- ── 2) RELEASE (deduct fallito dopo il claim) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.release_render_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE render_sessions
  SET status = 'pending', processing_started_at = NULL
  WHERE id = _session_id AND status = 'processing'
  RETURNING true;
$$;

REVOKE EXECUTE ON FUNCTION public.release_render_session(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_render_session(uuid) TO service_role;

-- ── 3) REFUND-ALL (tutti i consume non rimborsati della sessione) ──────────
CREATE OR REPLACE FUNCTION public.refund_render_credit_all(
  _company_id  uuid,
  _session_id  uuid,
  _reason_meta jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refunded integer := 0;
  v_balance integer;
  r record;
BEGIN
  IF _company_id IS NULL OR _session_id IS NULL THEN
    RETURN json_build_object('status', 'skipped', 'refunded', 0);
  END IF;

  -- Consume non ancora coperti da un refund: accoppiamo per ordine cronologico
  -- (i primi N consume sono coperti dai primi N refund).
  FOR r IN
    SELECT c.id, c.purchase_id, COALESCE(c.revenue_eur, 0) AS revenue_eur
    FROM render_credit_ledger c
    WHERE c.company_id = _company_id
      AND c.session_id = _session_id
      AND c.reason = 'consume'
    ORDER BY c.created_at ASC
    OFFSET (
      SELECT count(*) FROM render_credit_ledger
      WHERE company_id = _company_id AND session_id = _session_id AND reason = 'refund'
    )
  LOOP
    UPDATE render_credits
    SET balance = balance + 1,
        total_used = GREATEST(total_used - 1, 0),
        updated_at = now()
    WHERE company_id = _company_id
    RETURNING balance INTO v_balance;

    IF r.purchase_id IS NOT NULL AND to_regclass('public.render_credit_purchases') IS NOT NULL THEN
      EXECUTE 'UPDATE public.render_credit_purchases SET credits_remaining = credits_remaining + 1 WHERE id = $1'
      USING r.purchase_id;
    END IF;

    INSERT INTO render_credit_ledger (
      company_id, delta, balance_after, reason,
      session_id, user_id, revenue_eur, purchase_id, metadata
    ) VALUES (
      _company_id, 1, v_balance, 'refund',
      _session_id, NULL, -r.revenue_eur, r.purchase_id,
      COALESCE(_reason_meta, '{}'::jsonb)
        || jsonb_build_object('reason_text', 'Refund automatico (refund_all)', 'consume_ledger_id', r.id)
    );

    v_refunded := v_refunded + 1;
  END LOOP;

  RETURN json_build_object(
    'status', CASE WHEN v_refunded > 0 THEN 'refunded' ELSE 'no_outstanding_consume' END,
    'refunded', v_refunded,
    'balance_after', v_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_render_credit_all(uuid, uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_render_credit_all(uuid, uuid, jsonb) TO service_role;

-- ── 4) SWEEPER anti-zombie ──────────────────────────────────────────────────
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
      -- Isolate morta: processing da oltre 5 minuti (il budget edge è 140s).
      (rs.status = 'processing'
        AND rs.processing_started_at < now() - interval '5 minutes')
      -- Pending anomalo: credito scalato ma la sessione non è mai partita
      -- (morte tra deduct e update). I pending SENZA consume sono semplici
      -- wizard abbandonati: non costano nulla, non li tocchiamo.
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
      RAISE WARNING 'sweep_stuck_render_sessions: refund fallito per sessione % (%)', r.id, SQLERRM;
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
        NULL; -- la notifica è best-effort, non deve bloccare il refund
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_stuck_render_sessions() FROM public, anon, authenticated;

-- ── Cron ogni 5 minuti ──────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('sweep-stuck-render-sessions');
EXCEPTION WHEN OTHERS THEN
  NULL; -- primo deploy: il job non esiste ancora
END $$;

SELECT cron.schedule(
  'sweep-stuck-render-sessions',
  '*/5 * * * *',
  'SELECT public.sweep_stuck_render_sessions()'
);
