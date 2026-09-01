-- claim_render_vertical_session rifiutava SEMPRE con reason 'not_found'.
--
-- Causa: in PL/pgSQL `EXECUTE` NON aggiorna la variabile speciale FOUND. La
-- funzione faceva `EXECUTE ... INTO ...; IF NOT FOUND THEN RETURN 'not_found'`,
-- ma FOUND restava false -> il ramo not_found scattava sempre, anche con la
-- riga presente.
--
-- Effetto: gli 8 verticali render che usano questa claim (stanza, pavimento,
-- facciata, persiane, tetto, pergole, piscine, technical) non riuscivano piu'
-- ad avviare un render. L'edge riceveva claimed=false e rispondeva comunque
-- {accepted:true, status:"processing"} uscendo senza fare nulla: sessione ferma
-- in 'pending' per sempre. Ultimo render completato in stanza e tetto ad aprile
-- 2026. Applicata a prod via MCP il 2026-09-01.
--
-- Fix: ROW_COUNT via GET DIAGNOSTICS, che EXECUTE aggiorna correttamente.

CREATE OR REPLACE FUNCTION public.claim_render_vertical_session(
  _table text,
  _session_id uuid,
  _stale_seconds integer DEFAULT 170
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_rows integer := 0;
BEGIN
  IF NOT (_table = ANY(v_allowed)) THEN
    RETURN json_build_object('claimed', false, 'reason', 'table_not_allowed');
  END IF;

  EXECUTE format(
    'SELECT status, processing_started_at FROM public.%I WHERE id = $1 FOR UPDATE',
    _table
  ) INTO v_status, v_started USING _session_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
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
$function$;
