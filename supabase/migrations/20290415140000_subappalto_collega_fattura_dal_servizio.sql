-- Il giro del server collega da sé le fatture dei subappaltatori (area D, 15/11/2026).
--
-- subappalti-collega-fatture (cron ogni 15 minuti, migrazione successiva al deploy) chiama
-- subappalto_collega_fattura col service role. Prima la funzione chiedeva i permessi di
-- auth.uid(), che dal servizio è vuoto: ora il service role passa, ma solo con esito
-- 'automatico' (l'interruttore lo ricontrolla la funzione stessa e poi acquisti_collegamento_registra)
-- e mai per scollegare; nella traccia l'autore è il processo «subappalti-collega-fatture».
-- In più un esito vuoto è respinto (prima arrivava nullo alla traccia). Il resto è com'era
-- in 20290415130000_subappalto_fattura_interruttore_traccia.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.subappalto_collega_fattura(
  p_fattura uuid, p_contratto uuid, p_sal uuid DEFAULT NULL::uuid,
  p_esito text DEFAULT 'manuale', p_regola text DEFAULT NULL, p_prove jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  f record;
  ctr record;
  s record;
  r record;
  v_costo uuid;
  v_esito text := 'collegata';
  v_regola text := coalesce(nullif(btrim(p_regola), ''), 'subappalto_controllo_fattura');
  v_prove jsonb := coalesce(p_prove, '[]'::jsonb);
  v_importo numeric;
  v_servizio boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  -- Un esito vuoto non passa (prima il coalesce lo lasciava arrivare nullo alla traccia).
  IF p_esito IS NULL OR p_esito NOT IN ('manuale', 'automatico') THEN
    RAISE EXCEPTION 'Esito non valido: manuale o automatico.' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(v_prove) <> 'array' THEN
    RAISE EXCEPTION 'Le prove vanno passate come elenco.' USING errcode = '22023';
  END IF;

  SELECT id, company_id, cedente_piva, tipo_documento, stato, company_cost_id, purchase_order_id, imponibile_totale, totale_documento
    INTO f FROM public.fatture_ricevute WHERE id = p_fattura FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non trovata.' USING errcode = 'P0002'; END IF;

  IF v_servizio THEN
    -- Il giro del server (subappalti-collega-fatture) collega solo da sé, mai a nome di una persona.
    IF p_esito <> 'automatico' THEN
      RAISE EXCEPTION 'Dal servizio si collega solo con esito automatico.' USING errcode = '42501';
    END IF;
    PERFORM set_config('acquisti.processo', 'subappalti-collega-fatture', true);
  ELSIF NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', f.company_id), false)
     OR NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_view_subappaltatori_amministrazione', f.company_id), false) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di gestire le fatture dei subappalti.' USING errcode = '42501';
  END IF;

  IF p_contratto IS NULL AND v_servizio THEN
    RAISE EXCEPTION 'Il servizio non scollega: lo fa una persona.' USING errcode = '42501';
  END IF;
  IF p_contratto IS NULL THEN
    UPDATE public.fatture_ricevute SET contratto_subappalto_id = NULL, sal_subappaltatore_id = NULL, updated_at = now() WHERE id = f.id;
    -- La traccia dice che il collegamento non vale più (la storia resta).
    FOR r IN SELECT c.id FROM public.acquisti_collegamenti c
              WHERE c.company_id = f.company_id AND c.da_tipo = 'fattura_ricevuta' AND c.da_id = f.id
                AND c.a_tipo IN ('contratto', 'sal') AND c.stato IN ('proposto', 'collegato', 'verificato')
    LOOP
      PERFORM public.acquisti_collegamento_cambia_stato(r.id, 'annullato', 'Scollegata dal contratto di subappalto');
    END LOOP;
    RETURN jsonb_build_object('esito', 'scollegata', 'fattura_id', f.id);
  END IF;

  SELECT cs.id, cs.company_id, cs.order_id, cs.numero_contratto, ss.piva
    INTO ctr
    FROM public.contratti_subappalto cs
    LEFT JOIN public.subappaltatori_sicurezza ss ON ss.id = cs.subappaltatore_id
   WHERE cs.id = p_contratto;
  IF NOT FOUND OR ctr.company_id <> f.company_id THEN
    RAISE EXCEPTION 'Il contratto non è della stessa azienda della fattura.' USING errcode = '42501';
  END IF;
  IF public.partner_tax_key(f.cedente_piva) <> '' AND public.partner_tax_key(ctr.piva) <> ''
     AND public.partner_tax_key(f.cedente_piva) <> public.partner_tax_key(ctr.piva) THEN
    RAISE EXCEPTION 'La partita IVA della fattura non è quella del subappaltatore del contratto.' USING errcode = 'P0001';
  END IF;
  IF f.stato = 'rifiutata' THEN
    RAISE EXCEPTION 'La fattura è rifiutata: non si collega.' USING errcode = 'P0001';
  END IF;

  IF p_sal IS NOT NULL THEN
    SELECT id, contratto_id, stato, numero_sal INTO s FROM public.sal_subappaltatori WHERE id = p_sal;
    IF NOT FOUND OR s.contratto_id <> ctr.id THEN
      RAISE EXCEPTION 'Il SAL non è di questo contratto.' USING errcode = 'P0001';
    END IF;
    IF s.stato NOT IN ('verificato', 'pagato') THEN
      RAISE EXCEPTION 'Il SAL n. % non è ancora verificato: la fattura si emette dopo il benestare.', s.numero_sal USING errcode = 'P0001';
    END IF;
  END IF;

  v_importo := coalesce(f.imponibile_totale, f.totale_documento);

  -- Interruttore spento: un collegamento deciso dal controllo resta una proposta, nella traccia.
  IF p_esito = 'automatico' AND NOT public.azienda_collegamento_automatico(f.company_id) THEN
    PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'contratto', ctr.id, NULL,
      v_regola, 'proposta', v_prove, NULL, NULL, NULL, v_importo, 1, false, 'Collegamento automatico spento: da confermare');
    IF p_sal IS NOT NULL THEN
      PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'sal', p_sal, NULL,
        v_regola, 'proposta', v_prove, NULL, NULL, NULL, v_importo, 1, false, 'Collegamento automatico spento: da confermare');
    END IF;
    RETURN jsonb_build_object('esito', 'proposta', 'fattura_id', f.id, 'contratto_id', ctr.id, 'sal_id', p_sal);
  END IF;

  UPDATE public.fatture_ricevute
     SET contratto_subappalto_id = ctr.id,
         sal_subappaltatore_id = p_sal,
         order_id_suggerito = coalesce(order_id_suggerito, ctr.order_id),
         updated_at = now()
   WHERE id = f.id;

  -- Il SAL cambiato: le righe della traccia verso un altro SAL della stessa fattura non valgono più.
  FOR r IN SELECT c.id FROM public.acquisti_collegamenti c
            WHERE c.company_id = f.company_id AND c.da_tipo = 'fattura_ricevuta' AND c.da_id = f.id
              AND ((c.a_tipo = 'sal' AND c.a_id IS DISTINCT FROM p_sal) OR (c.a_tipo = 'contratto' AND c.a_id <> ctr.id))
              AND c.stato IN ('proposto', 'collegato', 'verificato')
  LOOP
    PERFORM public.acquisti_collegamento_cambia_stato(r.id, 'annullato', 'Collegata a un altro contratto o SAL');
  END LOOP;

  PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'contratto', ctr.id, NULL,
    v_regola, p_esito, v_prove, NULL, NULL, NULL, v_importo, 1, false, NULL);
  IF p_sal IS NOT NULL THEN
    PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'sal', p_sal, NULL,
      v_regola, p_esito, v_prove, NULL, NULL, NULL, v_importo, 1, false, NULL);
  END IF;

  v_costo := f.company_cost_id;
  IF v_costo IS NULL AND coalesce(f.tipo_documento, '') NOT IN ('TD04', 'passive_credit_note') THEN
    v_costo := (public.contabilizza_fattura_ricevuta(f.id) ->> 'company_cost_id')::uuid;
    v_esito := 'contabilizzata_e_collegata';
  END IF;

  IF v_costo IS NOT NULL AND ctr.order_id IS NOT NULL THEN
    UPDATE public.company_costs
       SET order_id = ctr.order_id, updated_at = now()
     WHERE id = v_costo AND company_id = f.company_id
       AND order_id IS NULL AND purchase_order_id IS NULL
       AND (allocations IS NULL OR jsonb_typeof(allocations) <> 'array' OR jsonb_array_length(allocations) = 0);
  END IF;

  RETURN jsonb_build_object('esito', v_esito, 'fattura_id', f.id, 'contratto_id', ctr.id, 'sal_id', p_sal,
                            'company_cost_id', v_costo, 'order_id', ctr.order_id);
END
$function$;

REVOKE ALL ON FUNCTION public.subappalto_collega_fattura(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subappalto_collega_fattura(uuid, uuid, uuid, text, text, jsonb) TO authenticated, service_role;
