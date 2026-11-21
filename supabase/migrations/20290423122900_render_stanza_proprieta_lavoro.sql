-- La data di presa in carico identifica il tentativo. Una chiusura tardiva
-- appartiene al vecchio tentativo e lascia intatti stato e crediti del nuovo.
CREATE OR REPLACE FUNCTION public.claim_render_stanza_lavoro(_company_id uuid, _session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  esito jsonb;
  preso_il timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.render_stanza_sessions
     WHERE id = _session_id AND company_id = _company_id
  ) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;
  esito := public.claim_render_vertical_session('render_stanza_sessions', _session_id, 170)::jsonb;
  IF (esito->>'claimed')::boolean IS DISTINCT FROM true THEN RETURN esito; END IF;

  SELECT processing_started_at INTO preso_il FROM public.render_stanza_sessions
   WHERE id = _session_id AND company_id = _company_id;
  IF (esito->>'stale_takeover')::boolean THEN
    PERFORM public.refund_render_credit_all(
      _company_id, _session_id, jsonb_build_object('source', 'stale_takeover', 'edge_fn', 'generate-room-render')
    );
  END IF;
  RETURN esito || jsonb_build_object('preso_il', preso_il);
END;
$$;

CREATE OR REPLACE FUNCTION public.addebita_render_stanza_lavoro(
  _company_id uuid, _session_id uuid, _preso_il timestamptz, _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.render_stanza_sessions
   WHERE id = _session_id AND company_id = _company_id
     AND status = 'processing' AND processing_started_at = _preso_il
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'obsolete'); END IF;

  -- Il ledger identifica il tentativo, anche quando l'accredito è illimitato
  -- e il consumo ha valore zero.
  IF EXISTS (
    SELECT 1 FROM public.render_credit_ledger
     WHERE company_id = _company_id AND session_id = _session_id AND reason = 'consume'
       AND metadata->>'stanza_preso_il' = extract(epoch FROM _preso_il)::text
  ) THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;
  RETURN public.deduct_render_credit_v3(
    _company_id, _session_id, _user_id,
    jsonb_build_object('vertical', 'stanza', 'edge_fn', 'generate-room-render', 'stanza_preso_il', extract(epoch FROM _preso_il)::text)
  )::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.termina_render_stanza_lavoro(
  _company_id uuid, _session_id uuid, _preso_il timestamptz, _errore text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.render_stanza_sessions
   WHERE id = _session_id AND company_id = _company_id
     AND status = 'processing' AND processing_started_at = _preso_il
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM public.refund_render_credit_all(
    _company_id, _session_id,
    jsonb_build_object('vertical', 'stanza', 'edge_fn', 'generate-room-render', 'error', left(_errore, 500))
  );

  UPDATE public.render_stanza_sessions
     SET status = CASE WHEN _errore IS NULL THEN 'pending' ELSE 'failed' END,
         error_message = left(_errore, 500),
         processing_started_at = CASE WHEN _errore IS NULL THEN NULL ELSE processing_started_at END,
         processing_completed_at = CASE WHEN _errore IS NULL THEN NULL ELSE now() END
   WHERE id = _session_id AND company_id = _company_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_render_stanza_lavoro(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.termina_render_stanza_lavoro(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_stanza_lavoro(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.termina_render_stanza_lavoro(uuid, uuid, timestamptz, text) TO service_role;
REVOKE ALL ON FUNCTION public.addebita_render_stanza_lavoro(uuid, uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.addebita_render_stanza_lavoro(uuid, uuid, timestamptz, uuid) TO service_role;
