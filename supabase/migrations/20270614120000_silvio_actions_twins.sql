-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-ACTIONS-TWINS-01 · Blocco 2 — gemelli d'azione
-- ────────────────────────────────────────────────────────────────────────────
-- Per ogni tool che VEDE, il gemello che FA. Tutti yellow-risk → action_proposal:
-- nessuna esecuzione senza conferma. Gli RPC sono thin recorder uniformi: validano
-- azienda e registrano l'intento in silvio_outbound_messages (coda+audit del Blocco 1),
-- la consegna reale la fa il processore di coda. Il dato (id cliente/fattura/…) arriva
-- dal tool di LETTURA che precede nel piano, non da query duplicate qui.
-- ════════════════════════════════════════════════════════════════════════════

-- helper interno: registra un intento d'azione nella coda outbound (uniforme)
CREATE OR REPLACE FUNCTION public.silvio_outbound_enqueue(
  p_company_id uuid, p_user_id uuid, p_dest_tipo text, p_dest_id uuid,
  p_canale text, p_scopo text, p_corpo text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'company_id obbligatorio'; END IF;
  INSERT INTO public.silvio_outbound_messages
    (company_id, created_by, dest_tipo, dest_id, canale, scopo, corpo, status)
  VALUES (p_company_id, p_user_id, p_dest_tipo, p_dest_id, COALESCE(p_canale,'email'), p_scopo, COALESCE(p_corpo,p_scopo), 'queued')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 1) sollecito pagamento (cliente)
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_sollecito_pagamento(
  p_company_id uuid, p_user_id uuid, p_cliente_id uuid DEFAULT NULL, p_fattura_id uuid DEFAULT NULL,
  p_tono text DEFAULT 'cortese', p_canale text DEFAULT 'email'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_fattura_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','fattura_id obbligatorio'); END IF;
  v_id := public.silvio_outbound_enqueue(p_company_id, p_user_id, 'cliente', p_cliente_id, p_canale, 'sollecito',
    format('Sollecito pagamento fattura %s (tono: %s)', p_fattura_id, COALESCE(p_tono,'cortese')));
  RETURN jsonb_build_object('ok',true,'outbound_id',v_id,'scopo','sollecito');
END $$;

-- 2) follow-up preventivo (cliente)
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_followup_preventivo(
  p_company_id uuid, p_user_id uuid, p_cliente_id uuid DEFAULT NULL, p_quote_id uuid DEFAULT NULL,
  p_canale text DEFAULT 'email'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_quote_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','quote_id obbligatorio'); END IF;
  v_id := public.silvio_outbound_enqueue(p_company_id, p_user_id, 'cliente', p_cliente_id, p_canale, 'followup',
    format('Follow-up preventivo %s', p_quote_id));
  RETURN jsonb_build_object('ok',true,'outbound_id',v_id,'scopo','followup');
END $$;

-- 3) ordine fornitore (fornitore)
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_ordine_fornitore(
  p_company_id uuid, p_user_id uuid, p_fornitore_id uuid DEFAULT NULL, p_articolo_id uuid DEFAULT NULL,
  p_quantita numeric DEFAULT NULL, p_canale text DEFAULT 'email'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_fornitore_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','fornitore_id obbligatorio'); END IF;
  v_id := public.silvio_outbound_enqueue(p_company_id, p_user_id, 'fornitore', p_fornitore_id, p_canale, 'ordine',
    format('Ordine a fornitore: articolo %s q.tà %s', COALESCE(p_articolo_id::text,'?'), COALESCE(p_quantita::text,'?')));
  RETURN jsonb_build_object('ok',true,'outbound_id',v_id,'scopo','ordine');
END $$;

-- 4) convoca formazione operaio (dipendente)
CREATE OR REPLACE FUNCTION public.silvio_tool_convoca_formazione_operaio(
  p_company_id uuid, p_user_id uuid, p_dipendente_id uuid DEFAULT NULL, p_formazione text DEFAULT NULL,
  p_canale text DEFAULT 'email'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_dipendente_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','dipendente_id obbligatorio'); END IF;
  v_id := public.silvio_outbound_enqueue(p_company_id, p_user_id, 'dipendente', p_dipendente_id, p_canale, 'convocazione_formazione',
    format('Convocazione formazione: %s', COALESCE(p_formazione,'rinnovo')));
  RETURN jsonb_build_object('ok',true,'outbound_id',v_id,'scopo','convocazione_formazione');
END $$;

-- 5) winback cliente dormiente (cliente)
CREATE OR REPLACE FUNCTION public.silvio_tool_lancia_winback(
  p_company_id uuid, p_user_id uuid, p_cliente_id uuid DEFAULT NULL, p_offerta text DEFAULT NULL,
  p_canale text DEFAULT 'email'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_cliente_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','cliente_id obbligatorio'); END IF;
  v_id := public.silvio_outbound_enqueue(p_company_id, p_user_id, 'cliente', p_cliente_id, p_canale, 'winback',
    format('Win-back cliente dormiente%s', CASE WHEN p_offerta IS NOT NULL THEN ' — offerta: '||p_offerta ELSE '' END));
  RETURN jsonb_build_object('ok',true,'outbound_id',v_id,'scopo','winback');
END $$;

-- 6) invia cedolino (dipendente)
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_cedolino(
  p_company_id uuid, p_user_id uuid, p_dipendente_id uuid DEFAULT NULL, p_cedolino_id uuid DEFAULT NULL,
  p_canale text DEFAULT 'email'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_dipendente_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','dipendente_id obbligatorio'); END IF;
  v_id := public.silvio_outbound_enqueue(p_company_id, p_user_id, 'dipendente', p_dipendente_id, p_canale, 'cedolino',
    format('Invio cedolino %s', COALESCE(p_cedolino_id::text,'(mese corrente)')));
  RETURN jsonb_build_object('ok',true,'outbound_id',v_id,'scopo','cedolino');
END $$;

-- 7) blocca slot calendario (interno, niente destinatario)
CREATE OR REPLACE FUNCTION public.silvio_tool_blocca_slot_calendario(
  p_company_id uuid, p_user_id uuid, p_inizio timestamptz DEFAULT NULL, p_fine timestamptz DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_inizio IS NULL THEN RETURN jsonb_build_object('ok',false,'error','inizio obbligatorio'); END IF;
  v_id := public.silvio_outbound_enqueue(p_company_id, p_user_id, NULL, NULL, 'email', 'blocco_slot',
    format('Blocco slot %s → %s%s', p_inizio, COALESCE(p_fine::text,'?'), CASE WHEN p_motivo IS NOT NULL THEN ' ('||p_motivo||')' ELSE '' END));
  RETURN jsonb_build_object('ok',true,'outbound_id',v_id,'scopo','blocco_slot');
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_outbound_enqueue(uuid,uuid,text,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_outbound_enqueue(uuid,uuid,text,uuid,text,text,text) TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT proname, oidvectortypes(proargtypes) AS args FROM pg_proc
           WHERE proname IN ('silvio_tool_invia_sollecito_pagamento','silvio_tool_invia_followup_preventivo',
             'silvio_tool_invia_ordine_fornitore','silvio_tool_convoca_formazione_operaio','silvio_tool_lancia_winback',
             'silvio_tool_invia_cedolino','silvio_tool_blocca_slot_calendario')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
  END LOOP;
END $$;
