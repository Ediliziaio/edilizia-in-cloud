-- Prima Nota, movimento diviso: note di credito dei fornitori e ritenuta del bonifico parlante
-- (23/11/2026).
--
-- Nota di credito: una RiBa paga due fatture meno una nota di credito del fornitore. La quota
-- «nota_credito» collega la nota alla fattura con nota_credito_collega (la stessa del
-- collegamento a mano), prima dei pagamenti: la fattura ha già il residuo ridotto quando si
-- paga. Non è denaro: non entra nella somma del movimento. Solo note ancora non collegate
-- (nota_credito_collega ricollega da capo e toglierebbe i collegamenti esistenti).
-- Le note di credito emesse nascono già collegate alla loro fattura: il residuo è già netto.
--
-- Ritenuta: un bonifico parlante porta in banca il netto (lordo meno 11% su lordo/1,22). La
-- quota della fattura emessa con «ritenuta» salda la fattura per il lordo e registra la ritenuta
-- con registra_bonifico_parlante, la stessa del bonifico parlante singolo.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Le note di credito collegate dal movimento: l'annullamento le scollega.
ALTER TABLE public.prima_nota_gruppi ADD COLUMN IF NOT EXISTS note_credito uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.prima_nota_documenti_aperti(p_company uuid, p_direction text)
RETURNS TABLE(tipo text, id uuid, numero text, data date, controparte text, totale numeric, residuo numeric, order_id uuid, order_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT (
       public.user_can_write_accountant_company(p_company)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (p_company = public.get_my_company_id() AND (public.e_amministratore_di(p_company)
        OR public.has_permission(auth.uid(), 'can_view_prima_nota')))) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare movimenti per questa azienda' USING ERRCODE = '42501';
  END IF;
  -- Le fatture ricevute: stesse regole di accesso di fatture_ricevute_saldi.
  IF p_direction = 'uscita' AND (public.utente_e_cliente_esterno() OR NOT coalesce(
       (p_company = public.get_my_company_id() AND public.puo_vedere_documenti_fornitore())
       OR public.user_can_read_accountant_company(p_company)
       OR public.e_super_admin_dentro(p_company), false)) THEN
    RAISE EXCEPTION 'Non puoi consultare i pagamenti delle fatture ricevute' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  -- Il saldo si calcola solo dove può esserci un residuo: fattura senza costo o costo non pagato
  -- (su 1.000 fatture, 3 secondi contro uno).
  SELECT 'fattura_ricevuta'::text, f.id, f.numero_fattura, f.data_fattura, f.cedente_ragione_sociale,
         s.dovuto, round(s.residuo, 2), k.order_id, o.order_code
    FROM public.fatture_ricevute f
    LEFT JOIN public.company_costs k ON k.id = f.company_cost_id
    LEFT JOIN public.orders o ON o.id = k.order_id
    CROSS JOIN LATERAL private.fatture_ricevute_calcola_saldi(f.company_id, NULL, f.id) s
   WHERE p_direction = 'uscita' AND f.company_id = p_company
     AND (k.id IS NULL OR NOT coalesce(k.is_paid, false))
     AND s.residuo > 0.005 AND NOT s.stornata
     AND f.stato <> 'rifiutata' AND f.tipo_documento NOT IN ('TD04', 'TD08', 'passive_credit_note')
  UNION ALL
  SELECT 'documento'::text, d.id, d.numero, d.data_emissione,
         coalesce(nullif(d.cliente_snapshot->>'ragione_sociale', ''), d.cliente_snapshot->>'nome'),
         d.totale_da_pagare,
         round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0) - public.documento_stornato_totale(d.id), 2),
         d.ordine_id, o.order_code
    FROM public.documenti_fiscali d
    LEFT JOIN public.orders o ON o.id = d.ordine_id
   WHERE p_direction = 'entrata' AND d.company_id = p_company AND d.deleted_at IS NULL
     AND d.tipo NOT IN ('nota_credito', 'ddt', 'proforma', 'preventivo')
     AND d.stato NOT IN ('bozza', 'annullata', 'stornata', 'pagata')
     AND coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0) - public.documento_stornato_totale(d.id) > 0.005
  UNION ALL
  SELECT 'invoice'::text, i.id, i.invoice_number, i.issue_date, i.client_company_name,
         i.total, round(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 2), i.order_id, o.order_code
    FROM public.invoices i
    LEFT JOIN public.orders o ON o.id = i.order_id
   WHERE p_direction = 'entrata' AND i.company_id = p_company AND i.deleted_at IS NULL
     AND i.document_type = 'invoice' AND i.status NOT IN ('paid', 'cancelled', 'credited', 'draft')
     AND coalesce(i.total, 0) - coalesce(i.paid_amount, 0) > 0.005
  UNION ALL
  -- Note di credito dei fornitori non ancora collegate: si compensano in un pagamento.
  SELECT 'nota_credito'::text, n.id, n.numero_fattura, n.data_fattura, n.cedente_ragione_sociale,
         public.nota_credito_importo(n.totale_documento, n.imponibile_totale, n.iva_totale, n.ritenuta_importo),
         public.nota_credito_importo(n.totale_documento, n.imponibile_totale, n.iva_totale, n.ritenuta_importo),
         NULL::uuid, NULL::text
    FROM public.fatture_ricevute n
   WHERE p_direction = 'uscita' AND n.company_id = p_company AND n.stato <> 'rifiutata'
     AND public.e_nota_credito_ricevuta(n.tipo_documento)
     AND NOT EXISTS (SELECT 1 FROM public.note_credito_storni s WHERE s.nota_id = n.id)
     AND public.nota_credito_importo(n.totale_documento, n.imponibile_totale, n.iva_totale, n.ritenuta_importo) > 0.005;
END $function$;
REVOKE ALL ON FUNCTION public.prima_nota_documenti_aperti(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_documenti_aperti(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.prima_nota_registra_divisa(p_company uuid, p_testata jsonb, p_quote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $function$
DECLARE
  v_dir text := p_testata->>'direction';
  v_data date := (p_testata->>'data')::date;
  v_tot numeric := round((p_testata->>'importo')::numeric, 2);
  v_metodo text := nullif(btrim(coalesce(p_testata->>'metodo', '')), '');
  v_rif text := nullif(btrim(coalesce(p_testata->>'riferimento', '')), '');
  v_conto text := coalesce(nullif(p_testata->>'account_label', ''), CASE WHEN lower(coalesce(v_metodo, '')) IN ('contanti', 'cash', 'mp01') THEN 'cassa' ELSE 'banca' END);
  v_banca uuid := nullif(p_testata->>'bank_account_id', '')::uuid;
  v_liq uuid := nullif(p_testata->>'conto_liquidita_id', '')::uuid;
  v_note text := nullif(btrim(coalesce(p_testata->>'note', '')), '');
  v_gruppo uuid; q jsonb; v_imp numeric; v_somma numeric := 0; v_tipo text; v_id uuid;
  v_costo uuid; v_pn uuid; v_mov uuid; v_esito jsonb; v_righe jsonb := '[]'::jsonb;
  v_desc text; r record; v_n int := 0; v_anno int; v_mese int; v_ced uuid;
  v_lordo numeric; v_rit uuid; v_banca_nome text;
BEGIN
  IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT (
       public.user_can_write_accountant_company(p_company)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (p_company = public.get_my_company_id() AND (public.e_amministratore_di(p_company)
        OR public.has_permission(auth.uid(), 'can_view_prima_nota')))) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare movimenti per questa azienda' USING ERRCODE = '42501';
  END IF;
  IF v_dir NOT IN ('entrata', 'uscita') OR v_data IS NULL OR v_tot IS NULL OR v_tot <= 0 THEN
    RAISE EXCEPTION 'Indica entrata o uscita, la data e un importo maggiore di zero' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_quote) <> 'array' OR jsonb_array_length(p_quote) = 0 THEN
    RAISE EXCEPTION 'Aggiungi almeno una quota' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_quote) > 200 THEN RAISE EXCEPTION 'Al massimo 200 quote per movimento' USING ERRCODE = '22023'; END IF;

  -- Controlli su tutte le quote prima di scrivere: somma, verso, doppioni.
  FOR q IN SELECT * FROM jsonb_array_elements(p_quote) LOOP
    v_n := v_n + 1;
    v_tipo := q->>'tipo';
    v_imp := (q->>'importo')::numeric;
    IF v_imp IS NULL OR v_imp <= 0 OR v_imp <> round(v_imp, 2) THEN
      RAISE EXCEPTION 'Quota %: importo non valido', v_n USING ERRCODE = '22023';
    END IF;
    IF v_tipo NOT IN ('fattura_ricevuta', 'costo', 'documento', 'invoice', 'libera', 'dipendente', 'nota_credito') THEN
      RAISE EXCEPTION 'Quota %: tipo «%» sconosciuto', v_n, v_tipo USING ERRCODE = '22023';
    END IF;
    IF v_tipo = 'nota_credito' AND (v_dir <> 'uscita' OR nullif(q->>'fattura_id', '') IS NULL) THEN
      RAISE EXCEPTION 'Quota %: la nota di credito va su una fattura del fornitore pagata con questo movimento', v_n USING ERRCODE = '22023';
    END IF;
    IF v_tipo = 'documento' AND coalesce((q->>'ritenuta')::boolean, false) THEN
      IF v_dir <> 'entrata' OR coalesce((q->>'lordo')::numeric, 0) <= v_imp THEN
        RAISE EXCEPTION 'Quota %: con la ritenuta il lordo saldato deve superare quanto è arrivato in banca', v_n USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_dir = 'entrata' AND v_tipo = 'dipendente' THEN
      RAISE EXCEPTION 'Quota %: uno stipendio è un''uscita', v_n USING ERRCODE = '22023';
    END IF;
    IF v_tipo = 'dipendente' AND (coalesce((q->>'mese')::int, 0) NOT BETWEEN 1 AND 12 OR coalesce((q->>'anno')::int, 0) NOT BETWEEN 2000 AND 2100) THEN
      RAISE EXCEPTION 'Quota %: indica il mese dello stipendio', v_n USING ERRCODE = '22023';
    END IF;
    IF (v_dir = 'entrata' AND v_tipo IN ('fattura_ricevuta', 'costo')) OR (v_dir = 'uscita' AND v_tipo IN ('documento', 'invoice')) THEN
      RAISE EXCEPTION 'Quota %: una fattura % non va in un movimento in %', v_n,
        CASE WHEN v_tipo IN ('fattura_ricevuta', 'costo') THEN 'ricevuta' ELSE 'emessa' END, v_dir USING ERRCODE = '22023';
    END IF;
    IF v_tipo = 'libera' AND nullif(btrim(coalesce(q->>'categoria', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Quota %: scegli la categoria', v_n USING ERRCODE = '22023';
    END IF;
    IF v_tipo <> 'libera' AND nullif(q->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Quota %: manca il documento', v_n USING ERRCODE = '22023';
    END IF;
    -- La nota di credito non è denaro che si muove: riduce il debito della fattura, non la somma.
    IF v_tipo <> 'nota_credito' THEN v_somma := v_somma + v_imp; END IF;
  END LOOP;
  IF abs(v_somma - v_tot) > 0.004 THEN
    RAISE EXCEPTION 'Le quote fanno % € ma il movimento è di % €', replace(to_char(v_somma, 'FM9999999990.00'), '.', ','), replace(to_char(v_tot, 'FM9999999990.00'), '.', ',') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_quote) e WHERE e->>'tipo' <> 'libera'
             GROUP BY e->>'tipo', e->>'id', e->>'anno', e->>'mese' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Lo stesso documento compare in due quote: uniscile' USING ERRCODE = '22023';
  END IF;

  -- La testata nasce già con le note di credito (chi registra può crearla, non modificarla).
  INSERT INTO public.prima_nota_gruppi(company_id, direction, descrizione, importo, entry_date, payment_method, reference_number, note_credito)
  VALUES (p_company, v_dir, coalesce(nullif(btrim(coalesce(p_testata->>'descrizione', '')), ''),
            CASE WHEN v_dir = 'entrata' THEN 'Incasso diviso' ELSE 'Pagamento diviso' END),
          v_tot, v_data, v_metodo, v_rif,
          (SELECT coalesce(array_agg((e->>'id')::uuid), '{}') FROM jsonb_array_elements(p_quote) e WHERE e->>'tipo' = 'nota_credito'))
  RETURNING id INTO v_gruppo;

  -- Prima le note di credito: riducono il debito, così il pagamento trova il residuo giusto.
  FOR q IN SELECT * FROM jsonb_array_elements(p_quote) e WHERE e->>'tipo' = 'nota_credito' LOOP
    IF EXISTS (SELECT 1 FROM public.note_credito_storni s WHERE s.nota_id = (q->>'id')::uuid) THEN
      RAISE EXCEPTION 'La nota di credito è già collegata a una fattura: gestiscila dalle fatture ricevute' USING ERRCODE = '22023';
    END IF;
    PERFORM public.nota_credito_collega((q->>'id')::uuid,
      jsonb_build_array(jsonb_build_object('fattura_id', q->>'fattura_id', 'importo', round((q->>'importo')::numeric, 2))));
    v_righe := v_righe || jsonb_build_object('tipo', 'nota_credito', 'id', q->>'id', 'fattura_id', q->>'fattura_id', 'importo', round((q->>'importo')::numeric, 2));
  END LOOP;

  FOR q IN SELECT * FROM jsonb_array_elements(p_quote) e WHERE e->>'tipo' <> 'nota_credito' LOOP
    v_tipo := q->>'tipo';
    v_imp := round((q->>'importo')::numeric, 2);
    v_id := nullif(q->>'id', '')::uuid;
    v_pn := NULL;

    IF v_tipo IN ('fattura_ricevuta', 'costo') THEN
      IF v_tipo = 'fattura_ricevuta' THEN
        SELECT company_cost_id INTO v_costo FROM public.fatture_ricevute WHERE id = v_id AND company_id = p_company;
        IF NOT FOUND THEN RAISE EXCEPTION 'Fattura ricevuta non trovata' USING ERRCODE = '22023'; END IF;
        IF v_costo IS NULL THEN
          v_costo := nullif(public.contabilizza_fattura_ricevuta(v_id)->>'company_cost_id', '')::uuid;
          IF v_costo IS NULL THEN RAISE EXCEPTION 'Una fattura ricevuta non si può contabilizzare: aprila e contabilizzala a mano' USING ERRCODE = '22023'; END IF;
        END IF;
      ELSE
        SELECT id INTO v_costo FROM public.company_costs WHERE id = v_id AND company_id = p_company;
        IF NOT FOUND THEN RAISE EXCEPTION 'Costo non trovato' USING ERRCODE = '22023'; END IF;
      END IF;
      v_esito := public.registra_pagamento_costo_con_conto(v_costo, gen_random_uuid(), v_imp, v_data,
                   coalesce(v_metodo, 'bonifico'), v_rif, v_banca, v_liq);
      v_pn := nullif(v_esito->>'prima_nota_id', '')::uuid;
      IF v_pn IS NULL THEN RAISE EXCEPTION 'Un pagamento non è stato registrato: il costo risulta già pagato' USING ERRCODE = '22023'; END IF;
      UPDATE public.prima_nota_entries SET gruppo_id = v_gruppo, account_label = v_conto,
             notes = coalesce(notes, v_note)
       WHERE id = v_pn;

    ELSIF v_tipo = 'documento' AND coalesce((q->>'ritenuta')::boolean, false) THEN
      -- Bonifico parlante: la fattura si salda per il lordo, in banca arriva il netto, la ritenuta
      -- resta registrata (registra_bonifico_parlante, ritenute_bonifici).
      v_lordo := round((q->>'lordo')::numeric, 2);
      SELECT coalesce(nullif(btrim(ba.display_name), ''), nullif(btrim(ba.account_name), ''), 'Banca') INTO v_banca_nome
        FROM public.bank_accounts ba WHERE ba.id = v_banca;
      v_rit := public.registra_bonifico_parlante(p_company, v_id, v_lordo, v_lordo - v_imp, 0, v_imp, v_data,
        coalesce(v_banca_nome, 'Banca'),
        left(coalesce(v_rif, 'Bonifico') || ' · fatt. ' || coalesce((SELECT numero FROM public.documenti_fiscali WHERE id = v_id), v_id::text), 200),
        gen_random_uuid(), true);
      SELECT movimento_id INTO v_mov FROM public.ritenute_bonifici WHERE id = v_rit;
      UPDATE public.prima_nota_entries SET gruppo_id = v_gruppo, account_label = v_conto,
             bank_account_id = v_banca, conto_liquidita_id = v_liq
       WHERE movimento_id = v_mov AND company_id = p_company
       RETURNING id INTO v_pn;

    ELSIF v_tipo = 'documento' THEN
      v_mov := public.registra_incasso_atomico(p_company, v_id, v_imp, coalesce(v_metodo, 'bonifico'), v_data, v_rif, v_note);
      UPDATE public.prima_nota_entries SET gruppo_id = v_gruppo, account_label = v_conto,
             bank_account_id = v_banca, conto_liquidita_id = v_liq
       WHERE movimento_id = v_mov AND company_id = p_company
       RETURNING id INTO v_pn;

    ELSIF v_tipo = 'invoice' THEN
      SELECT i.invoice_number, i.client_company_name, i.order_id,
             round(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 2) AS residuo
        INTO r FROM public.invoices i
       WHERE i.id = v_id AND i.company_id = p_company AND i.deleted_at IS NULL
         AND i.status NOT IN ('paid', 'cancelled', 'credited', 'draft');
      IF NOT FOUND THEN RAISE EXCEPTION 'Una fattura emessa non è più da incassare' USING ERRCODE = '22023'; END IF;
      IF v_imp > r.residuo + 0.01 THEN
        RAISE EXCEPTION 'Fattura %: incasso di % € oltre il residuo di % €', r.invoice_number, v_imp, r.residuo USING ERRCODE = '22023';
      END IF;
      v_desc := btrim(format('Incasso fattura %s%s', coalesce(r.invoice_number, ''), coalesce(' - ' || r.client_company_name, '')));
      INSERT INTO public.prima_nota_entries(company_id, direction, category, description, amount, entry_date, payment_method,
        reference_number, order_id, invoice_id, account_label, bank_account_id, conto_liquidita_id, notes,
        attachment_url, attachment_name, is_auto, created_by, gruppo_id)
      VALUES (p_company, 'entrata', 'incasso', v_desc, v_imp, v_data, v_metodo, coalesce(v_rif, 'Fatt. ' || r.invoice_number),
        r.order_id, v_id, v_conto, v_banca, v_liq, v_note,
        p_testata->>'attachment_url', p_testata->>'attachment_name', false, auth.uid(), v_gruppo)
      RETURNING id INTO v_pn;
      INSERT INTO public.invoice_payments(invoice_id, company_id, amount, payment_date, payment_method, reference, notes)
      VALUES (v_id, p_company, v_imp, v_data, v_metodo, 'prima_nota:' || v_pn, 'Incasso registrato dalla Prima nota');

    ELSIF v_tipo = 'dipendente' THEN
      v_anno := (q->>'anno')::int; v_mese := (q->>'mese')::int; v_ced := NULL;
      SELECT e.first_name, e.last_name INTO r FROM public.employees e WHERE e.id = v_id AND e.company_id = p_company;
      IF NOT FOUND THEN RAISE EXCEPTION 'Dipendente non trovato' USING ERRCODE = '22023'; END IF;
      SELECT c.id INTO v_ced FROM public.hr_cedolini c
       WHERE c.company_id = p_company AND c.employee_id = v_id AND c.anno = v_anno AND c.mese = v_mese AND c.stato <> 'bozza' LIMIT 1;
      INSERT INTO public.prima_nota_entries(company_id, direction, category, description, amount, entry_date, payment_method,
        reference_number, account_label, bank_account_id, conto_liquidita_id, notes,
        attachment_url, attachment_name, is_auto, created_by, gruppo_id, employee_id, cedolino_id)
      VALUES (p_company, 'uscita', 'stipendi',
        format('Stipendio %s %s · %s/%s', coalesce(r.last_name, ''), coalesce(r.first_name, ''), lpad(v_mese::text, 2, '0'), v_anno),
        v_imp, v_data, v_metodo, v_rif, v_conto, v_banca, v_liq, v_note,
        p_testata->>'attachment_url', p_testata->>'attachment_name', false, auth.uid(), v_gruppo, v_id, v_ced)
      RETURNING id INTO v_pn;
      -- Il cedolino del mese risulta pagato quel giorno, se chi registra può scriverlo (le regole
      -- dei cedolini lo lasciano fare solo all'amministratore: per gli altri non cambia niente).
      IF v_ced IS NOT NULL THEN
        UPDATE public.hr_cedolini SET data_pagamento = v_data, stato = 'pagato', updated_at = now() WHERE id = v_ced;
      END IF;

    ELSE -- libera
      INSERT INTO public.prima_nota_entries(company_id, direction, category, description, amount, entry_date, payment_method,
        reference_number, order_id, supplier_id, account_label, bank_account_id, conto_liquidita_id, notes,
        attachment_url, attachment_name, is_auto, created_by, gruppo_id)
      VALUES (p_company, v_dir, btrim(q->>'categoria'),
        coalesce(nullif(btrim(coalesce(q->>'descrizione', '')), ''), nullif(btrim(coalesce(p_testata->>'descrizione', '')), ''), 'Quota'),
        v_imp, v_data, v_metodo, v_rif, nullif(q->>'order_id', '')::uuid, nullif(q->>'supplier_id', '')::uuid,
        v_conto, v_banca, v_liq, v_note, p_testata->>'attachment_url', p_testata->>'attachment_name', false, auth.uid(), v_gruppo)
      RETURNING id INTO v_pn;
    END IF;

    IF v_pn IS NULL THEN RAISE EXCEPTION 'Una quota non è stata registrata' USING ERRCODE = '22023'; END IF;
    v_righe := v_righe || jsonb_build_object('tipo', v_tipo, 'id', v_id, 'prima_nota_id', v_pn, 'importo', v_imp);
  END LOOP;

  RETURN jsonb_build_object('gruppo_id', v_gruppo, 'righe', v_righe);
END $function$;
REVOKE ALL ON FUNCTION public.prima_nota_registra_divisa(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_registra_divisa(uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.banca_registra_divisa(p_company uuid, p_tx uuid, p_testata jsonb, p_quote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  t record; v_resto numeric; v_esito jsonb; v_ids uuid[]; v_dir text;
BEGIN
  PERFORM private.bank_operativa_access(p_company, true);
  SELECT b.id, b.amount, b.transaction_type, b.booking_date, b.account_id AS bank_account_id INTO t
    FROM public.bank_transactions b WHERE b.id = p_tx AND b.company_id = p_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento di banca non trovato' USING ERRCODE = 'P0002'; END IF;
  v_dir := CASE WHEN t.transaction_type = 'credit' THEN 'entrata' ELSE 'uscita' END;
  SELECT round(abs(t.amount) - coalesce(sum(r.matched_amount), 0), 2) INTO v_resto
    FROM public.bank_reconciliations r WHERE r.transaction_id = t.id AND r.unmatched_at IS NULL;
  IF round((p_testata->>'importo')::numeric, 2) <> v_resto THEN
    RAISE EXCEPTION 'Le quote devono fare quanto resta del movimento: % €', replace(to_char(v_resto, 'FM9999999990.00'), '.', ',') USING ERRCODE = '22023';
  END IF;
  -- Verso, data e conto sono quelli del movimento di banca, non quelli scritti nel popup.
  v_esito := public.prima_nota_registra_divisa(p_company,
    p_testata || jsonb_build_object('direction', v_dir, 'data', coalesce(t.booking_date, current_date),
                                    'bank_account_id', t.bank_account_id, 'account_label', 'banca'),
    p_quote);
  -- Le note di credito non hanno una riga di cassa: non si collegano alla banca.
  SELECT array_agg((x->>'prima_nota_id')::uuid) INTO v_ids FROM jsonb_array_elements(v_esito->'righe') x WHERE x ? 'prima_nota_id';
  PERFORM public.bank_associa_pagamenti(p_company, p_tx, v_ids);
  RETURN v_esito || jsonb_build_object('transazione', p_tx);
END $function$;
REVOKE ALL ON FUNCTION public.banca_registra_divisa(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.banca_registra_divisa(uuid, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.prima_nota_annulla_gruppo(p_gruppo uuid, p_motivo text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE g public.prima_nota_gruppi; e record; rec record; v_n integer := 0; v_nota uuid;
BEGIN
  SELECT * INTO g FROM public.prima_nota_gruppi WHERE id = p_gruppo FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR public.utente_bloccato() OR NOT (
       public.user_can_write_accountant_company(g.company_id)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (g.company_id = public.get_my_company_id() AND public.e_amministratore_di(g.company_id))) THEN
    RAISE EXCEPTION 'Solo un amministratore può annullare un movimento diviso' USING ERRCODE = '42501';
  END IF;
  IF g.annullato_il IS NOT NULL THEN RAISE EXCEPTION 'Il movimento è già stato annullato' USING ERRCODE = '22023'; END IF;
  IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Scrivi perché lo annulli' USING ERRCODE = '22023'; END IF;

  FOR e IN SELECT * FROM public.prima_nota_entries WHERE gruppo_id = g.id AND company_id = g.company_id ORDER BY created_at DESC LOOP
    -- Prima la banca: il movimento torna libero, la riga resta e si toglie sotto.
    IF e.bank_transaction_id IS NOT NULL THEN
      FOR rec IN SELECT r.id FROM public.bank_reconciliations r
                  WHERE r.company_id = g.company_id AND r.transaction_id = e.bank_transaction_id AND r.unmatched_at IS NULL
                    AND (r.prima_nota_id = e.id OR (e.movimento_id IS NOT NULL AND r.movimento_id = e.movimento_id)) LOOP
        PERFORM public.scollega_riga_ripartita(rec.id);
      END LOOP;
      UPDATE public.prima_nota_entries SET bank_transaction_id = NULL WHERE id = e.id AND bank_transaction_id IS NOT NULL;
    END IF;
    SELECT b.id, b.revisione INTO rec FROM public.ritenute_bonifici b
     WHERE b.company_id = g.company_id AND b.movimento_id = e.movimento_id AND b.stato <> 'stornata' LIMIT 1;
    IF e.movimento_id IS NOT NULL AND rec.id IS NOT NULL THEN
      -- Bonifico parlante: si storna la ritenuta, che storna anche l'incasso della fattura.
      PERFORM public.aggiorna_ritenuta_bonifico(g.company_id, rec.id, rec.revisione, 'storna', left('Movimento diviso annullato: ' || btrim(p_motivo), 200));
    ELSIF e.movimento_id IS NOT NULL AND e.documento_fiscale_id IS NOT NULL THEN
      PERFORM public.storna_incasso_atomico(g.company_id, e.movimento_id);
    ELSIF EXISTS (SELECT 1 FROM public.prima_nota_entries WHERE id = e.id) THEN
      PERFORM public.prima_nota_elimina_registrazione(e.id, (SELECT updated_at FROM public.prima_nota_entries WHERE id = e.id));
    END IF;
    IF e.cedolino_id IS NOT NULL THEN
      UPDATE public.hr_cedolini SET data_pagamento = NULL, stato = 'emesso', updated_at = now()
       WHERE id = e.cedolino_id AND stato = 'pagato' AND data_pagamento = e.entry_date;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  -- Le note di credito collegate da questo movimento tornano libere.
  FOREACH v_nota IN ARRAY coalesce(g.note_credito, '{}') LOOP
    PERFORM public.nota_credito_scollega(v_nota);
  END LOOP;
  UPDATE public.prima_nota_gruppi SET annullato_il = now(), annullato_da = auth.uid(), annullato_motivo = btrim(p_motivo) WHERE id = g.id;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.prima_nota_annulla_gruppo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_annulla_gruppo(uuid, text) TO authenticated;
