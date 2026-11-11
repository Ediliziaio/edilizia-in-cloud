-- Contabilità generale, lotto 3 delle correzioni dalla revisione dell'11/11/2026.
--
-- 1. Il giornale segue i documenti: una fattura emessa o ricevuta cambiata dopo la registrazione
--    (importi, conto, righe) si storna e si rifà al giro dopo; una annullata, rifiutata o cancellata,
--    un pagamento tolto, un incasso o un movimento di prima nota cancellati si stornano. Prima la
--    scrittura restava com'era per sempre. Il riepilogo dice quante (riallineate).
-- 2. F24: più righe dello stesso importo pagate da un movimento solo; un F24 già registrato prima che
--    arrivi il movimento non si conta due volte.
-- 3. Il giro automatico fa un'azienda per volta, ognuna con il suo COMMIT: i lock non restano presi.
-- 4. Il giornale non si stampa in definitivo fino al 31/12 di un esercizio non chiuso (le scritture
--    di fine anno vanno a quella data).
-- 5. Da Fine anno si scelgono anche i conti di TFR, utili a nuovo, IVA e debiti; un conto che fa già
--    da ruolo col suo codice non si prende per un altro; un ruolo, un conto; la natura di un conto
--    con movimenti non si cambia.
-- 6. Permessi: niente TRUNCATE per gli utenti sulle tabelle contabili; contabilita_documento_registrato
--    solo per le funzioni.
-- Le funzioni sono riprese intere dalla definizione in produzione, cambiate solo nei punti detti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.contabilita_genera_da_documenti(p_company uuid, p_anno integer, p_solo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $$
DECLARE
  k jsonb;
  v_dal date := make_date(p_anno, 1, 1);
  v_al date := make_date(p_anno, 12, 31);
  e record; r record; v_righe jsonb; v_nc boolean; v_conto text; v_causale text; v_origine text;
  n_em int := 0; n_ric int := 0; n_inc int := 0; n_pag int := 0; n_alt int := 0;
  s_testata int := 0; s_gia int := 0; s_errori jsonb := '[]'::jsonb;
  imp numeric; iva numeric; tot numeric; dif numeric; rit numeric; netto numeric; v_split boolean;
  v_ricavo_altro text; v_costo_altro text; v_indetraibile numeric; v_banca text; v_contro text; n_mov int := 0; s_giro int := 0; v_cedolini boolean; n_ced int := 0; v_viva public.contabilita_scritture; v_f24 jsonb; v_trib record; n_rif int := 0; v_banca_f24 numeric;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;
  -- Due generazioni insieme non registrano due volte lo stesso documento.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));

  SELECT coalesce(jsonb_object_agg(chiave, id), '{}'::jsonb) INTO k FROM (
    SELECT DISTINCT ON (chiave) chiave, id FROM (
      SELECT coalesce(codice_standard, codice) AS chiave, id, codice_standard IS NOT NULL AS esplicito, codice
        FROM public.contabilita_conti WHERE company_id = p_company AND movimentabile AND attivo
    ) x ORDER BY chiave, esplicito DESC, codice
  ) y;
  IF NOT (k ? '05.01' AND k ? '20.01' AND k ? '13.10' AND k ? '05.10' AND k ? '13.04' AND k ? '06.01' AND k ? '30.01') THEN
    RAISE EXCEPTION 'Mancano i conti per clienti, fornitori, banca, IVA, ricavi e acquisti (05.01, 05.10, 06.01, 13.04, 13.10, 20.01, 30.01): carica il piano standard o indica a quali conti corrispondono' USING ERRCODE = '22023';
  END IF;
  -- Con i cedolini in contabilità il costo del personale nasce lì: stipendi pagati e F24
  -- di ritenute e contributi chiudono i debiti verso dipendenti, Erario e INPS.
  v_cedolini := EXISTS (SELECT 1 FROM public.hr_cedolini h WHERE h.company_id = p_company AND h.anno = p_anno AND h.stato IN ('emesso', 'pagato'));
  v_ricavo_altro := CASE WHEN k ? '20.04' THEN '20.04' ELSE '20.01' END;
  v_costo_altro := CASE WHEN k ? '30.40' THEN '30.40' ELSE '30.01' END;

  -- Tutti i fatti dell'esercizio, in ordine di data: così anche i numeri seguono il calendario.
  FOR e IN SELECT * FROM (
  SELECT 'emessa', v.id, v.data_emissione, 1 FROM public.fatture_vendite_iva v
   WHERE v.company_id = p_company AND v.deleted_at IS NULL AND v.data_emissione BETWEEN v_dal AND v_al
     AND v.tipo IN ('fattura', 'fattura_pa', 'fattura_riepilogativa', 'fattura_accompagnatoria', 'parcella', 'nota_credito', 'nota_debito')
     AND coalesce(v.stato, '') NOT IN ('bozza', 'annullata', 'stornata', 'draft', 'cancelled', 'canceled', 'void', 'deleted', 'rifiutata', 'scartata')
  UNION ALL
  SELECT 'ricevuta', f.id, f.data_fattura, 2 FROM public.fatture_ricevute f
   WHERE f.company_id = p_company AND f.stato <> 'rifiutata' AND f.data_fattura BETWEEN v_dal AND v_al
  UNION ALL
  SELECT 'incasso', p.id, p.payment_date, 3 FROM public.invoice_payments p
   WHERE p.company_id = p_company AND p.payment_date BETWEEN v_dal AND v_al AND p.amount <> 0
     -- Le fatture native hanno gli incassi nella prima nota del documento: qui sarebbero doppi.
     AND NOT EXISTS (SELECT 1 FROM public.documenti_fiscali d WHERE d.id = p.invoice_id)
  UNION ALL
  SELECT 'incasso_fattura', i.id, coalesce(i.payment_date, i.due_date, i.issue_date), 3 FROM public.invoices i
   WHERE i.company_id = p_company AND i.deleted_at IS NULL AND i.document_type IN ('invoice', 'credit_note')
     -- Anche le fatture tornate a zero: un incasso registrato e poi tolto va stornato.
     AND (coalesce(i.paid_amount, 0) > 0 OR EXISTS (SELECT 1 FROM public.contabilita_scritture s
            WHERE s.company_id = p_company AND s.origine = 'incasso_fattura' AND s.origine_id = i.id))
     AND coalesce(i.payment_date, i.due_date, i.issue_date) BETWEEN v_dal AND v_al
     AND NOT EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM public.documenti_fiscali d WHERE d.id = i.id)
  UNION ALL
  SELECT 'incasso_documento', pn.id, pn.entry_date, 3 FROM public.prima_nota_entries pn
   WHERE pn.company_id = p_company AND pn.documento_fiscale_id IS NOT NULL AND pn.entry_date BETWEEN v_dal AND v_al AND pn.amount <> 0
  UNION ALL
  SELECT 'ritenuta_subita', d.id, coalesce((d.pagato_at AT TIME ZONE 'Europe/Rome')::date, d.data_emissione), 4 FROM public.documenti_fiscali d
   WHERE d.company_id = p_company AND d.deleted_at IS NULL AND d.stato = 'pagata' AND coalesce(d.ritenuta_importo, 0) > 0
     AND coalesce((d.pagato_at AT TIME ZONE 'Europe/Rome')::date, d.data_emissione) BETWEEN v_dal AND v_al
  UNION ALL
  SELECT 'pagamento', f.id, f.pagata_il, 4 FROM public.fatture_ricevute f
   WHERE f.company_id = p_company AND f.pagata_il BETWEEN v_dal AND v_al AND f.stato <> 'rifiutata'
     AND f.tipo_documento NOT IN ('TD04', 'TD08', 'TD16')
     -- Pagata dalla prima nota (pagamento del costo): lì c'è ogni versamento, con la sua data.
     AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries pn WHERE pn.company_id = p_company AND pn.cost_id = f.company_cost_id AND f.company_cost_id IS NOT NULL
                    AND pn.invoice_id IS NULL AND pn.documento_fiscale_id IS NULL)
     AND coalesce(f.totale_documento, 0) > 0
  UNION ALL
  -- Movimenti di prima nota che nessun documento racconta già: pagamenti dei costi, stipendi,
  -- F24, incassi e uscite senza fattura. Fuori gli incassi delle fatture (registro pagamenti e
  -- prima nota del documento) e i movimenti ricostruiti dagli F24 registrati a parte.
  SELECT 'prima_nota', pn.id, pn.entry_date, 5 FROM public.prima_nota_entries pn
   WHERE pn.company_id = p_company AND pn.entry_date BETWEEN v_dal AND v_al AND pn.amount <> 0
     AND pn.documento_fiscale_id IS NULL AND pn.invoice_id IS NULL
     -- Un movimento «sciolto» che ha la sua gemella sul documento (stessa data, stesso importo:
     -- pagata_il della fattura ricevuta, incasso della fattura emessa) è lo stesso soldo due volte.
     AND NOT (pn.cost_id IS NULL AND pn.direction = 'uscita' AND EXISTS (
           SELECT 1 FROM public.fatture_ricevute f WHERE f.company_id = p_company AND f.pagata_il = pn.entry_date
              AND (abs(coalesce(f.netto_a_pagare, f.totale_documento) - pn.amount) < 0.01
                OR abs(f.totale_documento - coalesce(f.ritenuta_importo, 0) - coalesce(f.trattenuta_garanzia, 0) - pn.amount) < 0.01)))
     AND NOT (pn.direction = 'entrata' AND EXISTS (
           SELECT 1 FROM public.invoices i WHERE i.company_id = p_company AND i.deleted_at IS NULL
              AND coalesce(i.payment_date, i.due_date, i.issue_date) = pn.entry_date AND abs(i.paid_amount - pn.amount) < 0.01
           UNION ALL
           SELECT 1 FROM public.invoice_payments ip WHERE ip.company_id = p_company AND ip.payment_date = pn.entry_date AND abs(ip.amount - pn.amount) < 0.01))
  UNION ALL
  -- I cedolini del mese, tutti insieme: costo del personale e debiti che nascono.
  SELECT 'cedolini', md5('cedolini:' || p_company || ':' || h.anno || ':' || h.mese)::uuid,
         (make_date(h.anno, h.mese, 1) + interval '1 month - 1 day')::date, 5
    FROM public.hr_cedolini h
   WHERE h.company_id = p_company AND h.anno = p_anno AND h.stato IN ('emesso', 'pagato')
   GROUP BY h.anno, h.mese
  UNION
  SELECT 'cedolini', s.origine_id, s.data_registrazione, 5 FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'cedolini' AND s.esercizio = p_anno
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
  UNION ALL
  SELECT 'f24', f.id, f.data_pagamento, 5 FROM public.f24_entries f
   WHERE f.company_id = p_company AND f.stato = 'pagato' AND f.data_pagamento BETWEEN v_dal AND v_al AND coalesce(f.importo, 0) <> 0
     -- Lo stesso versamento già in prima nota (stesso giorno, stesso importo): conta lì.
     AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries pn WHERE pn.company_id = p_company AND pn.direction = 'uscita'
                      AND pn.entry_date = f.data_pagamento AND pn.cost_id IS NULL
                      AND (abs(pn.amount - f.importo) < 0.01
                           -- Con più righe dello stesso importo il movimento ne copre una sola, la prima.
                           AND f.id = (SELECT h.id FROM public.f24_entries h WHERE h.company_id = p_company AND h.stato = 'pagato'
                                        AND h.data_pagamento = f.data_pagamento AND abs(h.importo - pn.amount) < 0.01 ORDER BY h.id LIMIT 1)
                        -- Un solo movimento per tutto l'F24 del giorno (più tributi): conta lì, diviso per tributo.
                        OR abs(pn.amount - (SELECT sum(g.importo) FROM public.f24_entries g WHERE g.company_id = p_company
                                              AND g.stato = 'pagato' AND g.data_pagamento = f.data_pagamento)) < 0.01))
  UNION ALL
  -- Scritture vive il cui documento non c'è più (annullato, rifiutato, cancellato, pagamento tolto):
  -- si stornano. L'id è quello della scrittura; con p_solo si guarda il documento.
  SELECT 'sparita', s.id, s.data_registrazione, 0 FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.esercizio = p_anno
     AND s.origine IN ('fattura_emessa', 'fattura_ricevuta', 'pagamento', 'incasso', 'prima_nota')
     AND (p_solo IS NULL OR s.origine_id = p_solo)
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
     AND NOT CASE s.origine
       WHEN 'fattura_emessa' THEN EXISTS (SELECT 1 FROM public.fatture_vendite_iva v WHERE v.id = s.origine_id AND v.company_id = p_company
              AND v.deleted_at IS NULL
              AND v.tipo IN ('fattura', 'fattura_pa', 'fattura_riepilogativa', 'fattura_accompagnatoria', 'parcella', 'nota_credito', 'nota_debito')
              AND coalesce(v.stato, '') NOT IN ('bozza', 'annullata', 'stornata', 'draft', 'cancelled', 'canceled', 'void', 'deleted', 'rifiutata', 'scartata'))
       WHEN 'fattura_ricevuta' THEN EXISTS (SELECT 1 FROM public.fatture_ricevute f WHERE f.id = s.origine_id AND f.company_id = p_company AND f.stato <> 'rifiutata')
       WHEN 'pagamento' THEN EXISTS (SELECT 1 FROM public.fatture_ricevute f WHERE f.id = s.origine_id AND f.company_id = p_company
              AND f.pagata_il IS NOT NULL AND f.stato <> 'rifiutata')
       WHEN 'incasso' THEN EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.id = s.origine_id AND p.company_id = p_company AND p.amount <> 0)
       WHEN 'prima_nota' THEN EXISTS (SELECT 1 FROM public.prima_nota_entries pn WHERE pn.id = s.origine_id AND pn.company_id = p_company AND pn.amount <> 0)
     END
  ) ev(tipo, id, data, ordine)
  WHERE p_solo IS NULL OR ev.id = p_solo OR ev.tipo = 'sparita'
  ORDER BY ev.data, ev.ordine, ev.id
  LOOP
    v_origine := CASE e.tipo WHEN 'emessa' THEN 'fattura_emessa' WHEN 'ricevuta' THEN 'fattura_ricevuta' ELSE e.tipo END;
    IF e.tipo NOT IN ('cedolini', 'incasso_fattura', 'emessa', 'ricevuta', 'sparita') AND public.contabilita_documento_registrato(p_company, v_origine, e.id) THEN s_gia := s_gia + 1; CONTINUE; END IF;
    v_righe := '[]'::jsonb;
    BEGIN
      IF e.tipo = 'emessa' THEN
        SELECT * INTO r FROM public.fatture_vendite_iva WHERE id = e.id AND company_id = p_company;
        IF r.imponibile_totale IS NULL OR r.totale_documento IS NULL THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Importi con segno: positivi = fattura, negativi = nota di credito (anche riga per riga).
        imp := r.imponibile_totale; iva := coalesce(r.iva_totale, 0); tot := r.totale_documento;
        IF r.tipo = 'nota_credito' AND imp + iva > 0 THEN imp := -imp; iva := -iva; tot := -tot; END IF;
        v_nc := imp + iva < 0;
        v_split := coalesce(r.esigibilita_iva, 'I') = 'S';
        IF v_split THEN tot := tot - iva; iva := 0; END IF;  -- il cliente paga senza IVA, la versa l'ente
        dif := round(tot - imp - iva, 2);
        IF imp = 0 AND iva = 0 AND tot = 0 THEN CONTINUE; END IF;
        v_righe := public.contabilita_riga(k->>'05.01', 'dare', tot, r.cliente_snapshot->>'ragione_sociale')
                || public.contabilita_riga(k->>'20.01', 'avere', imp, NULL)
                || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL)
                || public.contabilita_riga(k->>v_ricavo_altro, 'avere', dif, CASE WHEN dif * sign(tot) > 0 THEN 'bollo e spese fuori imponibile' ELSE 'arrotondamenti e abbuoni' END);
        v_causale := CASE WHEN v_nc THEN 'Nota di credito emessa' WHEN v_split THEN 'Fattura emessa (split payment)' ELSE 'Fattura emessa' END;
        -- Già registrata: se il documento è cambiato dopo (importi, conto, righe) si storna e si rifà.
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = v_origine AND s.origine_id = e.id
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_viva.id IS NOT NULL THEN
          IF public.contabilita_righe_uguali(v_viva.id, v_righe) THEN s_gia := s_gia + 1; CONTINUE; END IF;
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
            'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Documento cambiato dopo la registrazione', v_viva.documento_numero, v_viva.documento_data,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_viva.id), 'storno', v_viva.id, v_viva.id);
          n_rif := n_rif + 1;
        END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, r.data_emissione), v_causale, r.cliente_snapshot->>'ragione_sociale',
          r.numero, r.data_emissione, v_righe, v_origine, e.id, NULL);
        n_em := n_em + 1;

      ELSIF e.tipo = 'ricevuta' THEN
        SELECT f.*, c.category INTO r FROM public.fatture_ricevute f LEFT JOIN public.company_costs c ON c.id = f.company_cost_id WHERE f.id = e.id;
        IF r.imponibile_totale IS NULL OR r.iva_totale IS NULL THEN s_testata := s_testata + 1; CONTINUE; END IF;
        imp := r.imponibile_totale; iva := r.iva_totale; tot := coalesce(r.totale_documento, r.imponibile_totale + r.iva_totale);
        IF r.tipo_documento IN ('TD04', 'TD08') AND imp + iva > 0 THEN imp := -imp; iva := -iva; tot := -tot; END IF;
        v_nc := imp + iva < 0;
        IF imp = 0 AND iva = 0 THEN CONTINUE; END IF;
        IF r.tipo_documento = 'TD16' THEN
          -- Reverse charge interno: il costo e il debito verso il fornitore vengono dalla sua fattura.
          IF iva = 0 THEN CONTINUE; END IF;
          v_righe := public.contabilita_riga(k->>'05.10', 'dare', iva, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL);
          v_causale := 'Integrazione IVA reverse charge (TD16)';
        ELSE
          v_conto := public.contabilita_ruolo_disponibile(k, public.contabilita_conto_da_categoria(coalesce(r.category, r.categoria_ai)));
          -- IVA detraibile solo in parte (detraibilita_percentuale): la quota indetraibile è costo.
          v_indetraibile := round(iva * (100 - least(100, greatest(0, coalesce(r.detraibilita_percentuale, 100)))) / 100, 2);
          -- Il costo si divide per conto, riga per riga (conti_righe); il resto sul conto della fattura.
          v_righe := public.contabilita_righe_costo(k, r.righe, r.conti_righe, imp, v_indetraibile, v_conto, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>'05.10', 'dare', iva - v_indetraibile, NULL);
          IF r.tipo_documento IN ('TD17', 'TD18', 'TD19') AND iva <> 0 THEN
            -- Integrazione estera: il fornitore è debitore del solo imponibile, l'IVA va anche fra i debiti.
            v_righe := v_righe || public.contabilita_riga(k->>'13.04', 'avere', imp, r.cedente_ragione_sociale)
                               || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL);
            v_causale := 'Integrazione reverse charge';
          ELSE
            dif := round(tot - imp - iva, 2);
            v_righe := v_righe || public.contabilita_riga(k->>'13.04', 'avere', tot, r.cedente_ragione_sociale)
                               || public.contabilita_riga(k->>v_costo_altro, 'dare', dif, CASE WHEN dif * sign(tot) > 0 THEN 'bollo e spese fuori imponibile' ELSE 'arrotondamenti e abbuoni' END);
            v_causale := CASE WHEN v_nc THEN 'Nota di credito ricevuta' ELSE 'Fattura ricevuta' END;
          END IF;
        END IF;
        -- Già registrata: se il documento è cambiato dopo (importi, conto, righe) si storna e si rifà.
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = v_origine AND s.origine_id = e.id
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_viva.id IS NOT NULL THEN
          IF public.contabilita_righe_uguali(v_viva.id, v_righe) THEN s_gia := s_gia + 1; CONTINUE; END IF;
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
            'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Documento cambiato dopo la registrazione', v_viva.documento_numero, v_viva.documento_data,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_viva.id), 'storno', v_viva.id, v_viva.id);
          n_rif := n_rif + 1;
        END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, r.data_fattura), v_causale, r.cedente_ragione_sociale,
          r.numero_fattura, r.data_fattura, v_righe, v_origine, e.id, NULL);
        n_ric := n_ric + 1;

      ELSIF e.tipo = 'incasso' THEN
        SELECT p.amount, p.payment_date, p.invoice_id, i.invoice_number, i.client_company_name, i.document_type INTO r
          FROM public.invoice_payments p JOIN public.invoices i ON i.id = p.invoice_id WHERE p.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', r.invoice_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Su una nota di credito il «pagamento» è un rimborso al cliente.
        tot := CASE WHEN r.document_type IN ('credit_note', 'TD04', 'TD08') THEN -r.amount ELSE r.amount END;
        v_righe := public.contabilita_riga(k->>'06.01', 'dare', tot, NULL)
                || public.contabilita_riga(k->>'05.01', 'avere', tot, r.client_company_name);
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, r.payment_date),
          CASE WHEN tot < 0 THEN 'Rimborso nota di credito' ELSE 'Incasso fattura' END, r.client_company_name,
          r.invoice_number, NULL, v_righe, v_origine, e.id, NULL);
        n_inc := n_inc + 1;

      ELSIF e.tipo = 'incasso_fattura' THEN
        SELECT i.paid_amount, i.invoice_number, i.client_company_name, i.document_type INTO r FROM public.invoices i WHERE i.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Nota di credito «pagata»: rimborsata o compensata, in ogni caso esce dal credito verso il cliente.
        tot := CASE WHEN r.document_type = 'credit_note' THEN -coalesce(r.paid_amount, 0) ELSE coalesce(r.paid_amount, 0) END;
        -- L'incassato cresce a rate (500, poi altri 500) o torna indietro: si registra la differenza con
        -- quanto è già nel giornale per questa fattura (incassi e loro storni, sul credito verso il cliente).
        tot := tot - coalesce((SELECT sum(rr.avere - rr.dare) FROM public.contabilita_righe rr
                                 JOIN public.contabilita_scritture s ON s.id = rr.scrittura_id
                                WHERE s.company_id = p_company AND rr.conto_id = (k->>'05.01')::uuid
                                  AND ((s.origine = 'incasso_fattura' AND s.origine_id = e.id)
                                    OR (s.origine = 'storno' AND s.storno_di IN (SELECT x.id FROM public.contabilita_scritture x
                                          WHERE x.company_id = p_company AND x.origine = 'incasso_fattura' AND x.origine_id = e.id)))), 0);
        IF abs(tot) < 0.005 THEN s_gia := s_gia + 1; CONTINUE; END IF;
        v_righe := public.contabilita_riga(k->>'06.01', 'dare', tot, NULL)
                || public.contabilita_riga(k->>'05.01', 'avere', tot, r.client_company_name);
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data),
          CASE WHEN r.document_type = 'credit_note' AND tot < 0 THEN 'Rimborso nota di credito'
               WHEN r.document_type = 'credit_note' THEN 'Rimborso nota di credito annullato'
               WHEN tot < 0 THEN 'Incasso fattura annullato' ELSE 'Incasso fattura' END, r.client_company_name,
          r.invoice_number, NULL, v_righe, v_origine, e.id, NULL);
        n_inc := n_inc + 1;

      ELSIF e.tipo = 'incasso_documento' THEN
        SELECT pn.amount, pn.direction, pn.documento_fiscale_id, pn.account_label, d.numero, d.cliente_snapshot->>'ragione_sociale' AS cliente INTO r
          FROM public.prima_nota_entries pn JOIN public.documenti_fiscali d ON d.id = pn.documento_fiscale_id WHERE pn.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', r.documento_fiscale_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Un'uscita legata al documento è l'annullamento di un incasso: va al contrario.
        v_conto := CASE WHEN r.account_label = 'cassa' AND k ? '06.02' THEN '06.02' ELSE '06.01' END;
        v_righe := jsonb_build_array(
          jsonb_build_object('conto_id', k->>v_conto, CASE WHEN r.direction = 'entrata' THEN 'dare' ELSE 'avere' END, abs(r.amount)),
          jsonb_build_object('conto_id', k->>'05.01', CASE WHEN r.direction = 'entrata' THEN 'avere' ELSE 'dare' END, abs(r.amount), 'descrizione', r.cliente));
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data),
          CASE WHEN r.direction = 'entrata' THEN 'Incasso fattura' ELSE 'Annullamento incasso' END, r.cliente,
          r.numero, NULL, v_righe, v_origine, e.id, NULL);
        n_inc := n_inc + 1;

      ELSIF e.tipo = 'ritenuta_subita' THEN
        SELECT d.ritenuta_importo, d.numero, d.cliente_snapshot->>'ragione_sociale' AS cliente INTO r FROM public.documenti_fiscali d WHERE d.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        IF NOT k ? '05.12' THEN RAISE EXCEPTION 'manca il conto delle ritenute subite (ruolo 05.12)'; END IF;
        v_righe := jsonb_build_array(
          jsonb_build_object('conto_id', k->>'05.12', 'dare', r.ritenuta_importo, 'descrizione', 'ritenuta d''acconto subita'),
          jsonb_build_object('conto_id', k->>'05.01', 'avere', r.ritenuta_importo, 'descrizione', r.cliente));
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Ritenuta d''acconto subita', r.cliente,
          r.numero, NULL, v_righe, v_origine, e.id, NULL);
        n_alt := n_alt + 1;

      ELSIF e.tipo = 'pagamento' THEN
        SELECT f.totale_documento, f.netto_a_pagare, f.ritenuta_importo, f.trattenuta_garanzia, f.numero_fattura, f.cedente_ragione_sociale,
               f.tipo_documento, f.imponibile_totale INTO r
          FROM public.fatture_ricevute f WHERE f.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_ricevuta', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        rit := coalesce(r.ritenuta_importo, 0);
        netto := coalesce(r.netto_a_pagare, r.totale_documento - rit - coalesce(r.trattenuta_garanzia, 0));
        -- Integrazione estera: al fornitore si deve l'imponibile, l'IVA è solo in contabilità.
        IF r.tipo_documento IN ('TD17', 'TD18', 'TD19') THEN rit := 0; netto := coalesce(r.imponibile_totale, 0); END IF;
        IF netto <= 0 AND rit <= 0 THEN CONTINUE; END IF;
        IF rit > 0 AND NOT k ? '13.12' THEN RAISE EXCEPTION 'manca il conto delle ritenute da versare (ruolo 13.12)'; END IF;
        v_righe := jsonb_build_array(jsonb_build_object('conto_id', k->>'13.04', 'dare', netto + rit, 'descrizione', r.cedente_ragione_sociale));
        IF netto > 0 THEN v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'06.01', 'avere', netto)); END IF;
        IF rit > 0 THEN v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'13.12', 'avere', rit, 'descrizione', 'ritenuta d''acconto da versare')); END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Pagamento fornitore', r.cedente_ragione_sociale,
          r.numero_fattura, NULL, v_righe, v_origine, e.id, NULL);
        n_pag := n_pag + 1;

      ELSIF e.tipo = 'prima_nota' THEN
        SELECT pn.*, c.category AS costo_categoria, c.name AS costo_nome, f.id AS fattura_id, f.cedente_ragione_sociale, f.netto_a_pagare,
               f.ritenuta_importo, f.totale_documento AS fattura_totale, f.trattenuta_garanzia, f.tipo_documento, f.imponibile_totale AS fattura_imponibile
          INTO r
          FROM public.prima_nota_entries pn
          LEFT JOIN public.company_costs c ON c.id = pn.cost_id
          LEFT JOIN LATERAL (SELECT * FROM public.fatture_ricevute x WHERE x.company_cost_id = pn.cost_id AND pn.cost_id IS NOT NULL
                                AND x.stato <> 'rifiutata'
                              ORDER BY x.data_fattura LIMIT 1) f ON true
         WHERE pn.id = e.id;
        v_banca := CASE WHEN lower(coalesce(r.account_label, '')) LIKE 'cassa%' AND k ? '06.02' THEN '06.02' ELSE '06.01' END;
        -- Importo con segno dal punto di vista della contropartita: uscita = dare, entrata (anche storno) = avere.
        tot := CASE WHEN r.direction = 'uscita' THEN abs(r.amount) ELSE -abs(r.amount) END;
        IF lower(coalesce(r.category, '')) ~ 'giroconto' THEN s_giro := s_giro + 1; CONTINUE; END IF;
        IF r.fattura_id IS NOT NULL THEN
          -- Pagamento (o storno del pagamento) di una fattura ricevuta: chiude il fornitore.
          IF NOT public.contabilita_documento_registrato(p_company, 'fattura_ricevuta', r.fattura_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
          IF public.contabilita_documento_registrato(p_company, 'pagamento', r.fattura_id) THEN s_gia := s_gia + 1; CONTINUE; END IF;
          rit := coalesce(r.ritenuta_importo, 0);
          netto := coalesce(r.netto_a_pagare, r.fattura_totale - rit - coalesce(r.trattenuta_garanzia, 0));
          IF r.tipo_documento IN ('TD17', 'TD18', 'TD19') OR coalesce(netto, 0) <= 0 THEN rit := 0; END IF;
          -- La ritenuta segue il pagamento in proporzione: col saldo è tutta versata all'Erario.
          rit := CASE WHEN rit > 0 THEN round(rit * tot / netto, 2) ELSE 0 END;
          IF rit <> 0 AND NOT k ? '13.12' THEN RAISE EXCEPTION 'manca il conto delle ritenute da versare (ruolo 13.12)'; END IF;
          v_righe := public.contabilita_riga(k->>'13.04', 'dare', tot + rit, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>v_banca, 'avere', tot, NULL)
                  || public.contabilita_riga(k->>'13.12', 'avere', rit, CASE WHEN rit <> 0 THEN 'ritenuta d''acconto da versare' END);
          v_causale := CASE WHEN tot > 0 THEN 'Pagamento fornitore' ELSE 'Storno pagamento fornitore' END;
          v_contro := r.cedente_ragione_sociale;
        ELSE
          v_contro := coalesce(r.costo_nome, r.description);
          v_conto := CASE
            WHEN v_cedolini AND lower(coalesce(r.category, '')) ~ '(stipend|salari|retribuz)' AND k ? '13.30' THEN '13.30'
            WHEN r.cost_id IS NOT NULL THEN public.contabilita_conto_da_categoria(coalesce(r.costo_categoria, r.category))
            WHEN lower(coalesce(r.category, '')) ~ '(pagamento_fornitore|^fornitor)' THEN '13.04'
            WHEN lower(coalesce(r.category, '')) ~ '^incass' THEN '05.01'
            WHEN lower(coalesce(r.category, '')) ~ '(fiscal|f24|tribut|impost|tass)' AND r.cost_id IS NULL THEN
              CASE WHEN k ? '13.13' THEN '13.13' WHEN k ? '13.11' THEN '13.11' ELSE '30.40' END
            WHEN r.cost_id IS NOT NULL THEN public.contabilita_conto_da_categoria(coalesce(r.costo_categoria, r.category))
            WHEN r.direction = 'entrata' THEN v_ricavo_altro
            WHEN lower(coalesce(r.category, '')) IN ('', 'altro', 'altre') THEN v_costo_altro
            ELSE public.contabilita_conto_da_categoria(r.category)
          END;
          IF NOT k ? v_conto THEN v_conto := CASE WHEN r.direction = 'entrata' THEN v_ricavo_altro ELSE v_costo_altro END; END IF;
          v_righe := public.contabilita_riga(k->>v_conto, 'dare', tot, v_contro)
                  || public.contabilita_riga(k->>v_banca, 'avere', tot, NULL);
          -- Il movimento paga un F24 registrato (stesso giorno, l'importo di un tributo o di tutto
          -- l'F24 del giorno): ogni tributo va sul suo conto, come se l'F24 si registrasse da sé.
          IF r.direction = 'uscita' AND r.cost_id IS NULL THEN
            SELECT jsonb_agg(jsonb_build_object('id', g.id, 't', g.tributo_code, 'd', g.tributo_descrizione, 'i', g.importo) ORDER BY g.tributo_code, g.id) INTO v_f24
              FROM public.f24_entries g
             WHERE g.company_id = p_company AND g.stato = 'pagato' AND g.data_pagamento = r.entry_date AND coalesce(g.importo, 0) <> 0
               AND (abs((SELECT sum(h.importo) FROM public.f24_entries h WHERE h.company_id = p_company AND h.stato = 'pagato'
                           AND h.data_pagamento = r.entry_date) - abs(r.amount)) < 0.01
                 OR g.id = (SELECT h.id FROM public.f24_entries h WHERE h.company_id = p_company AND h.stato = 'pagato'
                             AND h.data_pagamento = r.entry_date AND abs(h.importo - abs(r.amount)) < 0.01 ORDER BY h.id LIMIT 1));
            IF v_f24 IS NOT NULL THEN
              -- Un tributo già registrato da solo (l'F24 è arrivato prima del movimento) ha già tolto
              -- la sua parte dalla banca: qui restano gli altri.
              SELECT jsonb_agg(t) INTO v_f24 FROM jsonb_array_elements(v_f24) t
               WHERE NOT public.contabilita_documento_registrato(p_company, 'f24', (t->>'id')::uuid);
              IF v_f24 IS NULL THEN s_gia := s_gia + 1; CONTINUE; END IF;
              SELECT sum((t->>'i')::numeric) INTO v_banca_f24 FROM jsonb_array_elements(v_f24) t;
              v_righe := public.contabilita_riga(k->>v_banca, 'avere', v_banca_f24 * sign(tot), NULL);
              FOR v_trib IN SELECT value AS t FROM jsonb_array_elements(v_f24) LOOP
                v_righe := v_righe || public.contabilita_riga(k->>public.contabilita_ruolo_tributo(k, v_trib.t->>'t', v_cedolini), 'dare',
                  (v_trib.t->>'i')::numeric * sign(tot), concat_ws(' ', 'tributo', v_trib.t->>'t', v_trib.t->>'d'));
              END LOOP;
              v_conto := '13.11';
            END IF;
          END IF;
          v_causale := CASE
            WHEN v_conto = '13.04' THEN 'Pagamento fornitore'
            WHEN v_conto = '05.01' THEN 'Incasso da cliente'
            WHEN v_conto = '13.30' THEN 'Pagamento stipendi'
            WHEN v_conto IN ('13.13', '13.11') THEN 'Versamento F24'
            WHEN r.direction = 'entrata' THEN 'Entrata di prima nota'
            ELSE 'Uscita di prima nota' END;
        END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), v_causale, coalesce(r.description, v_contro),
          r.reference_number, NULL, v_righe, v_origine, e.id, NULL);
        n_mov := n_mov + 1;

      ELSIF e.tipo = 'cedolini' THEN
        SELECT sum(coalesce(h.lordo, 0)) AS lordo, sum(coalesce(h.ritenute_irpef, 0)) AS irpef,
               sum(coalesce(h.contributi_dipendente, 0)) AS cdip, sum(coalesce(h.contributi_datore, 0)) AS cdat,
               sum(coalesce(h.netto, coalesce(h.lordo, 0) - coalesce(h.ritenute_irpef, 0) - coalesce(h.contributi_dipendente, 0))) AS netto,
               count(*) AS n
          INTO r FROM public.hr_cedolini h
         WHERE h.company_id = p_company AND h.anno = extract(year FROM e.data)::int AND h.mese = extract(month FROM e.data)::int
           AND h.stato IN ('emesso', 'pagato');
        IF NOT (k ? '13.12' AND k ? '13.20' AND k ? '13.30') THEN
          RAISE EXCEPTION 'con i cedolini servono i conti Erario c/ritenute, debiti verso istituti previdenziali e debiti verso dipendenti (ruoli 13.12, 13.20, 13.30)';
        END IF;
        -- Il netto è quello del cedolino; quello che il lordo non spiega (altre trattenute) va fra i debiti diversi.
        dif := round(r.lordo - r.irpef - r.cdip - r.netto, 2);
        v_righe := public.contabilita_riga(k->>'30.10', 'dare', r.lordo, 'retribuzioni lorde')
                || public.contabilita_riga(k->>(CASE WHEN k ? '30.11' THEN '30.11' ELSE '30.10' END), 'dare', r.cdat, 'contributi a carico dell''azienda')
                || public.contabilita_riga(k->>'13.12', 'avere', r.irpef, 'ritenute IRPEF dei dipendenti')
                || public.contabilita_riga(k->>'13.20', 'avere', r.cdip + r.cdat, 'contributi da versare')
                || public.contabilita_riga(k->>'13.30', 'avere', r.netto, 'netto da pagare ai dipendenti')
                || public.contabilita_riga(k->>(CASE WHEN k ? '13.31' THEN '13.31' ELSE '13.30' END), 'avere', dif, 'altre trattenute');
        -- Il mese si registra una volta, ma i cedolini cambiano (una bozza emessa dopo, una correzione):
        -- se la scrittura viva non corrisponde più, si storna e si rifà.
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = 'cedolini' AND s.origine_id = e.id
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_viva.id IS NOT NULL THEN
          IF (SELECT jsonb_agg(jsonb_build_array(conto_id, dare, avere) ORDER BY conto_id, dare, avere) FROM public.contabilita_righe WHERE scrittura_id = v_viva.id)
             = (SELECT jsonb_agg(jsonb_build_array((x->>'conto_id')::uuid, coalesce((x->>'dare')::numeric, 0), coalesce((x->>'avere')::numeric, 0))
                                 ORDER BY (x->>'conto_id')::uuid, coalesce((x->>'dare')::numeric, 0), coalesce((x->>'avere')::numeric, 0))
                  FROM jsonb_array_elements(v_righe) x) THEN
            s_gia := s_gia + 1; CONTINUE;
          END IF;
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
            'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Cedolini del mese cambiati', NULL, NULL,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_viva.id),
            'storno', v_viva.id, v_viva.id);
        END IF;
        IF r.n = 0 THEN CONTINUE; END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Cedolini del mese',
          r.n || ' cedolini di ' || to_char(e.data, 'MM/YYYY'), NULL, NULL, v_righe, v_origine, e.id, NULL);
        n_ced := n_ced + 1;

      ELSIF e.tipo = 'sparita' THEN
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s WHERE s.id = e.id;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
          'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Documento annullato, rifiutato o cancellato', v_viva.documento_numero, v_viva.documento_data,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_viva.id), 'storno', v_viva.id, v_viva.id);
        n_rif := n_rif + 1;

      ELSIF e.tipo = 'f24' THEN
        SELECT * INTO r FROM public.f24_entries WHERE id = e.id;
        v_conto := public.contabilita_ruolo_tributo(k, r.tributo_code, v_cedolini);
        v_righe := public.contabilita_riga(k->>v_conto, 'dare', r.importo, concat_ws(' ', 'tributo', r.tributo_code, r.tributo_descrizione))
                || public.contabilita_riga(k->>'06.01', 'avere', r.importo, NULL);
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Versamento F24',
          concat_ws(' ', 'F24', lpad(r.mese::text, 2, '0') || '/' || r.anno, r.tributo_code), r.tributo_code, NULL, v_righe, v_origine, e.id, NULL);
        n_mov := n_mov + 1;
      END IF;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('%s %s del %s: %s', e.tipo, e.id, to_char(e.data, 'DD/MM/YYYY'), SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'fatture_emesse', n_em, 'fatture_ricevute', n_ric, 'incassi', n_inc, 'pagamenti', n_pag, 'altre', n_alt,
    'movimenti', n_mov, 'giroconti_saltati', s_giro, 'cedolini', n_ced,
    'saltate_solo_testata', s_testata, 'gia_generate', s_gia, 'riallineate', n_rif, 'errori', s_errori);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_genera_azienda(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '300s' AS $$
DECLARE v_anno int; v_oggi int := extract(year FROM (now() AT TIME ZONE 'Europe/Rome'))::int; v_esito jsonb; v_fatte int := 0; v_errori int := 0;
BEGIN
  -- La generazione ammette il service role: è il cron, non un utente.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  FOREACH v_anno IN ARRAY ARRAY[v_oggi - 1, v_oggi] LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.contabilita_esercizi e
                           WHERE e.company_id = p_company AND e.anno = v_anno AND e.chiuso_il IS NOT NULL);
    BEGIN
      v_esito := public.contabilita_genera_da_documenti(p_company, v_anno);
      v_fatte := v_fatte + 1;
    EXCEPTION WHEN others THEN
      v_esito := jsonb_build_object('errore', SQLERRM);
      v_errori := v_errori + 1;
    END;
    INSERT INTO public.contabilita_esercizi (company_id, anno, generato_il, generato_esito, aggiornato_il)
    VALUES (p_company, v_anno, now(), v_esito, now())
    ON CONFLICT (company_id, anno) DO UPDATE SET generato_il = now(), generato_esito = EXCLUDED.generato_esito, aggiornato_il = now();
  END LOOP;
  RETURN jsonb_build_object('esercizi', v_fatte, 'errori', v_errori);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_genera_azienda(uuid) FROM PUBLIC, anon, authenticated;

-- Il cron chiama la procedura: ogni azienda si chiude con COMMIT, così i suoi lock non restano
-- presi fino alla fine del giro e un utente che registra non aspetta le altre aziende.
CREATE OR REPLACE PROCEDURE public.contabilita_genera_automatica_a_turno()
LANGUAGE plpgsql AS $$
DECLARE v_aziende uuid[];
  a uuid;
BEGIN
  SELECT array_agg(c.id ORDER BY c.id) INTO v_aziende FROM public.companies c
   WHERE c.contabilita_generale_attiva AND c.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.contabilita_conti k WHERE k.company_id = c.id);
  FOREACH a IN ARRAY coalesce(v_aziende, '{}') LOOP
    PERFORM public.contabilita_genera_azienda(a);
    COMMIT;
  END LOOP;
END $$;
REVOKE ALL ON PROCEDURE public.contabilita_genera_automatica_a_turno() FROM PUBLIC, anon, authenticated;

-- La funzione di prima resta per chi la chiama a mano: stesso lavoro, una transazione.
CREATE OR REPLACE FUNCTION public.contabilita_genera_automatica()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '600s' AS $$
DECLARE a record; v jsonb; v_fatte int := 0; v_errori int := 0;
BEGIN
  FOR a IN SELECT c.id FROM public.companies c
            WHERE c.contabilita_generale_attiva AND c.deleted_at IS NULL
              AND EXISTS (SELECT 1 FROM public.contabilita_conti k WHERE k.company_id = c.id) LOOP
    v := public.contabilita_genera_azienda(a.id);
    v_fatte := v_fatte + (v->>'esercizi')::int; v_errori := v_errori + (v->>'errori')::int;
  END LOOP;
  RETURN jsonb_build_object('esercizi', v_fatte, 'errori', v_errori);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_genera_automatica() FROM PUBLIC, anon, authenticated;

SELECT cron.alter_job(j.jobid, command := 'CALL public.contabilita_genera_automatica_a_turno()')
  FROM cron.job j WHERE j.jobname = 'contabilita-genera-automatica';

CREATE OR REPLACE FUNCTION public.contabilita_stampa_definitiva(p_company uuid, p_anno integer, p_al date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE e public.contabilita_esercizi; v_dal date; v_n int;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_al IS NULL OR extract(year FROM p_al) <> p_anno OR p_al > current_date THEN
    RAISE EXCEPTION 'Data non valida: dev''essere nell''esercizio e non nel futuro' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno FOR UPDATE;
  -- Ammortamenti, rimanenze, ratei, TFR e chiusura stanno al 31/12: stampato quel giorno, l'anno non
  -- si chiuderebbe più.
  IF p_al = make_date(p_anno, 12, 31) AND e.chiuso_il IS NULL THEN
    RAISE EXCEPTION 'Il 31/12 si stampa dopo la chiusura dell''esercizio: le scritture di fine anno vanno a quella data. Stampa fino al 30/12, o chiudi prima' USING ERRCODE = '22023';
  END IF;
  IF e.stampato_fino_al IS NOT NULL AND p_al <= e.stampato_fino_al THEN
    RAISE EXCEPTION 'Il giornale è già stampato in definitivo fino al %', to_char(e.stampato_fino_al, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  v_dal := coalesce(e.stampato_fino_al + 1, make_date(p_anno, 1, 1));
  SELECT count(*) INTO v_n FROM public.contabilita_scritture
   WHERE company_id = p_company AND esercizio = p_anno AND data_registrazione BETWEEN v_dal AND p_al;
  INSERT INTO public.contabilita_esercizi (company_id, anno, stampato_fino_al, stampe, aggiornato_il)
  VALUES (p_company, p_anno, p_al, jsonb_build_array(jsonb_build_object('dal', v_dal, 'al', p_al, 'scritture', v_n, 'il', now(), 'da', auth.uid())), now())
  ON CONFLICT (company_id, anno) DO UPDATE SET stampato_fino_al = p_al, aggiornato_il = now(),
    stampe = public.contabilita_esercizi.stampe || jsonb_build_array(jsonb_build_object('dal', v_dal, 'al', p_al, 'scritture', v_n, 'il', now(), 'da', auth.uid()));
  RETURN jsonb_build_object('dal', v_dal, 'al', p_al, 'scritture', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_assegna_ruolo(p_company uuid, p_ruolo text, p_conto uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_natura text := CASE p_ruolo
    WHEN '04.01' THEN 'attivo' WHEN '04.02' THEN 'attivo' WHEN '07.01' THEN 'attivo' WHEN '07.02' THEN 'attivo'
    WHEN '14.01' THEN 'passivo' WHEN '14.02' THEN 'passivo' WHEN '20.03' THEN 'ricavo' WHEN '30.30' THEN 'costo'
    WHEN '20.04' THEN 'ricavo' WHEN '30.40' THEN 'costo'
    WHEN '01.01' THEN 'attivo' WHEN '01.02' THEN 'attivo'
    WHEN '02.01' THEN 'attivo' WHEN '02.02' THEN 'attivo' WHEN '02.03' THEN 'attivo' WHEN '02.04' THEN 'attivo' WHEN '02.05' THEN 'attivo'
    WHEN '02.90' THEN 'attivo' WHEN '02.91' THEN 'attivo' WHEN '02.92' THEN 'attivo' WHEN '02.93' THEN 'attivo'
    WHEN '30.20' THEN 'costo' WHEN '30.21' THEN 'costo'
    WHEN '30.12' THEN 'costo' WHEN '12.01' THEN 'passivo' WHEN '10.04' THEN 'passivo' WHEN '10.05' THEN 'passivo'
    WHEN '05.11' THEN 'attivo' WHEN '06.02' THEN 'attivo' WHEN '50.01' THEN 'costo'
    WHEN '13.11' THEN 'passivo' WHEN '13.12' THEN 'passivo' WHEN '13.13' THEN 'passivo' WHEN '13.20' THEN 'passivo' WHEN '13.30' THEN 'passivo' END;
  c record;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF v_natura IS NULL THEN RAISE EXCEPTION 'Ruolo non assegnabile da Fine anno: %', p_ruolo USING ERRCODE = '22023'; END IF;
  SELECT codice, natura, codice_standard INTO c FROM public.contabilita_conti
   WHERE id = p_conto AND company_id = p_company AND movimentabile AND attivo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Il conto non è un conto movimentabile di questa azienda' USING ERRCODE = '22023'; END IF;
  IF c.natura <> v_natura THEN RAISE EXCEPTION 'Per questo ruolo serve un conto di natura «%»', v_natura USING ERRCODE = '22023'; END IF;
  -- Un conto fa già da ruolo anche senza codice_standard, quando il suo codice è quello del ruolo.
  IF coalesce(c.codice_standard, c.codice) <> p_ruolo
     AND (c.codice_standard IS NOT NULL OR public.contabilita_conti_per_ruolo(p_company)->>c.codice = p_conto::text) THEN
    RAISE EXCEPTION 'Il conto % fa già da %: scegline un altro, o crealo nel Piano dei conti', c.codice, coalesce(c.codice_standard, c.codice) USING ERRCODE = '22023';
  END IF;
  UPDATE public.contabilita_conti SET codice_standard = NULL WHERE company_id = p_company AND codice_standard = p_ruolo AND id <> p_conto;
  UPDATE public.contabilita_conti SET codice_standard = p_ruolo WHERE id = p_conto;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_aggiorna_conto(p_conto uuid, p_descrizione text, p_natura text, p_sezione_cee text, p_voce_cee text, p_codice_standard text, p_nota text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.contabilita_conti WHERE id = p_conto;
  IF v_company IS NULL OR NOT public.contabilita_puo_scrivere(v_company) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_descrizione, '')) = '' THEN RAISE EXCEPTION 'La descrizione è obbligatoria' USING ERRCODE = '22023'; END IF;
  -- Un ruolo, un conto: con due conti sullo stesso ruolo vinceva il codice più basso, senza dirlo.
  IF nullif(btrim(coalesce(p_codice_standard, '')), '') IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.contabilita_conti WHERE company_id = v_company AND id <> p_conto
          AND codice_standard = btrim(p_codice_standard)) THEN
    RAISE EXCEPTION 'Il ruolo % è già di un altro conto: toglilo da lì prima', btrim(p_codice_standard) USING ERRCODE = '22023';
  END IF;
  -- La natura decide stato patrimoniale o conto economico: con movimenti registrati non si cambia.
  IF EXISTS (SELECT 1 FROM public.contabilita_conti WHERE id = p_conto AND natura IS DISTINCT FROM p_natura)
     AND EXISTS (SELECT 1 FROM public.contabilita_righe WHERE conto_id = p_conto) THEN
    RAISE EXCEPTION 'Il conto ha già movimenti: la natura non si cambia (sposterebbe i saldi fra stato patrimoniale e conto economico)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.contabilita_conti
     SET descrizione = btrim(p_descrizione), natura = p_natura, sezione_cee = nullif(p_sezione_cee, ''),
         voce_cee = nullif(btrim(coalesce(p_voce_cee, '')), ''), codice_standard = nullif(btrim(coalesce(p_codice_standard, '')), ''),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   WHERE id = p_conto;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_fine_anno(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb; v_amm jsonb; v_lordo numeric; v_tfr numeric; v_id_tfr uuid; v_fatte jsonb := '[]'::jsonb; v_prima boolean;
  v_tfr_viva public.contabilita_scritture; v_tfr_registrato numeric;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0)); END IF;
  k := public.contabilita_conti_per_ruolo(p_company);
  v_id_tfr := md5('tfr:' || p_company || ':' || p_anno)::uuid;

  v_amm := public.contabilita_ammortamenti(p_company, p_anno, true);
  -- Anche a totale zero: una scrittura rimasta da un cespite tolto va stornata.
  IF NOT p_anteprima AND (((v_amm->>'totale')::numeric > 0 AND NOT (v_amm->>'registrati')::boolean) OR (v_amm->>'da_aggiornare')::boolean) THEN
    v_amm := public.contabilita_ammortamenti(p_company, p_anno, false);
    v_fatte := v_fatte || '["ammortamenti"]'::jsonb;
  END IF;

  SELECT coalesce(sum(lordo), 0) INTO v_lordo FROM public.hr_cedolini
   WHERE company_id = p_company AND anno = p_anno AND stato IN ('emesso', 'pagato');
  v_tfr := round(v_lordo / 13.5, 2);

  -- Il TFR registrato e quello di oggi: i cedolini di dicembre arrivano spesso dopo, e allora si rifà.
  SELECT s.* INTO v_tfr_viva FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'tfr' AND s.origine_id = v_id_tfr
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_tfr_registrato := (SELECT sum(dare) FROM public.contabilita_righe WHERE scrittura_id = v_tfr_viva.id);

  IF NOT p_anteprima AND (v_tfr_viva.id IS NULL AND v_tfr > 0 OR v_tfr_viva.id IS NOT NULL AND abs(v_tfr_registrato - v_tfr) >= 0.005) THEN
    IF v_tfr > 0 AND NOT (k ? '30.12' AND k ? '12.01') THEN
      RAISE EXCEPTION 'Mancano i conti per l''accantonamento TFR (30.12, 12.01): indicali in Fine anno' USING ERRCODE = '22023';
    END IF;
    IF v_tfr_viva.id IS NOT NULL THEN
      PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_tfr_viva.data_registrazione),
        'Storno n. ' || v_tfr_viva.numero || '/' || v_tfr_viva.esercizio, 'TFR ricalcolato sui cedolini', NULL, NULL,
        (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
           FROM public.contabilita_righe WHERE scrittura_id = v_tfr_viva.id), 'storno', v_tfr_viva.id, v_tfr_viva.id);
    END IF;
    IF v_tfr > 0 THEN
      PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Accantonamento TFR',
        'Quota TFR ' || p_anno || ' sulle retribuzioni dei cedolini', NULL, NULL,
        public.contabilita_riga(k->>'30.12', 'dare', v_tfr, NULL) || public.contabilita_riga(k->>'12.01', 'avere', v_tfr, NULL),
        'tfr', v_id_tfr, NULL);
    END IF;
    v_tfr_registrato := CASE WHEN v_tfr > 0 THEN v_tfr END;
    v_tfr_viva.id := CASE WHEN v_tfr > 0 THEN v_id_tfr END;
    v_fatte := v_fatte || '["tfr"]'::jsonb;
  END IF;
  v_prima := (v_amm->>'registrati')::boolean;
  RETURN jsonb_build_object('ammortamenti', v_amm->'quote', 'totale_ammortamenti', (v_amm->>'totale')::numeric,
    'retribuzioni', v_lordo, 'tfr', v_tfr,
    -- «Registrati» solo se il giornale è ancora quello giusto: un registro cambiato chiede di rifarli.
    'ammortamenti_registrati', v_prima AND NOT (v_amm->>'da_aggiornare')::boolean,
    'ammortamenti_da_aggiornare', (v_amm->>'da_aggiornare')::boolean,
    'conti_mancanti_ammortamenti', v_amm->'conti_mancanti',
    -- «Registrato» solo se il giornale ha ancora l'importo giusto.
    'tfr_registrato', v_tfr_viva.id IS NOT NULL AND abs(coalesce(v_tfr_registrato, 0) - v_tfr) < 0.005,
    'tfr_da_aggiornare', v_tfr_viva.id IS NOT NULL AND abs(coalesce(v_tfr_registrato, 0) - v_tfr) >= 0.005,
    'conti_mancanti_tfr', CASE WHEN v_tfr > 0 THEN to_jsonb(array_remove(ARRAY[CASE WHEN NOT k ? '30.12' THEN '30.12' END, CASE WHEN NOT k ? '12.01' THEN '12.01' END], NULL)) ELSE '[]'::jsonb END,
    'registrate', v_fatte);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_chiudi_esercizio(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb; v_utile_conto uuid; v_mastro uuid; v_righe jsonb := '[]'::jsonb; v_aper jsonb := '[]'::jsonb;
  v_utile numeric := 0; x record; v_iva numeric := 0; v_fine jsonb; v_a_nuovo uuid; v_id_chiu uuid; v_id_aper uuid; v_aper_esiste boolean; v_n_ce int := 0; v_n_sp int := 0; v_prima_aperto int;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno AND chiuso_il IS NOT NULL) THEN
    RAISE EXCEPTION 'L''esercizio % è già chiuso', p_anno USING ERRCODE = '23505';
  END IF;
  -- Gli esercizi si chiudono in ordine: un anno prima ancora aperto porterebbe la sua apertura dentro
  -- questo, già chiuso, e l'apertura dell'anno dopo partirebbe da saldi incompleti.
  SELECT min(s.esercizio) INTO v_prima_aperto FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.esercizio < p_anno
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_esercizi e WHERE e.company_id = p_company AND e.anno = s.esercizio AND e.chiuso_il IS NOT NULL);
  IF v_prima_aperto IS NOT NULL AND NOT p_anteprima THEN
    RAISE EXCEPTION 'Chiudi prima l''esercizio %: gli esercizi si chiudono in ordine', v_prima_aperto USING ERRCODE = '22023';
  END IF;
  IF NOT p_anteprima AND EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno + 1 AND chiuso_il IS NOT NULL) THEN
    RAISE EXCEPTION 'L''esercizio % è già chiuso: riaprilo prima di chiudere il %', p_anno + 1, p_anno USING ERRCODE = '22023';
  END IF;
  k := public.contabilita_conti_per_ruolo(p_company);
  v_id_chiu := md5('chiusura:' || p_company || ':' || p_anno)::uuid;
  v_id_aper := md5('apertura:' || p_company || ':' || (p_anno + 1))::uuid;
  v_aper_esiste := EXISTS (SELECT 1 FROM public.contabilita_scritture s
                            WHERE s.company_id = p_company AND s.esercizio = p_anno + 1 AND s.origine = 'apertura'
                              AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id));

  -- Epilogo: i conti economici col saldo dell'anno, girati al contrario.
  FOR x IN
    SELECT c.id, c.codice, c.descrizione, sum(r.dare - r.avere) AS saldo
      FROM public.contabilita_righe r
      JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
      JOIN public.contabilita_conti c ON c.id = r.conto_id
     WHERE s.company_id = p_company AND s.esercizio = p_anno AND c.natura IN ('costo', 'ricavo')
     GROUP BY c.id, c.codice, c.descrizione HAVING sum(r.dare - r.avere) <> 0 ORDER BY c.codice
  LOOP
    v_righe := v_righe || public.contabilita_riga(x.id::text, 'avere', x.saldo, 'chiusura del conto');
    v_utile := v_utile - x.saldo;   -- ricavi (saldo avere) fanno utile
    v_n_ce := v_n_ce + 1;
  END LOOP;

  -- Lo stato patrimoniale a fine anno, dopo l'epilogo (l'utile va sul suo conto).
  SELECT count(*) INTO v_n_sp FROM (
    SELECT c.id FROM public.contabilita_righe r
      JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
      JOIN public.contabilita_conti c ON c.id = r.conto_id
     WHERE s.company_id = p_company AND s.esercizio = p_anno AND c.natura IN ('attivo', 'passivo')
     GROUP BY c.id HAVING sum(r.dare - r.avere) <> 0) z;

  -- L'IVA dell'ultimo periodo va liquidata prima: ad anno chiuso la liquidazione al 31/12 non entra più.
  SELECT coalesce(sum(abs(t.saldo)), 0) INTO v_iva FROM (
    SELECT sum(r.dare - r.avere) AS saldo FROM public.contabilita_righe r
      JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
     WHERE s.company_id = p_company AND s.esercizio = p_anno
       AND r.conto_id IN ((k->>'13.10')::uuid, (k->>'05.10')::uuid)
     GROUP BY r.conto_id) t;
  v_fine := public.contabilita_fine_anno(p_company, p_anno, true);
  IF p_anteprima THEN
    RETURN jsonb_build_object('utile', v_utile, 'conti_economici', v_n_ce, 'conti_patrimoniali', v_n_sp,
      'apertura_gia_presente', v_aper_esiste, 'conto_utile', k ? '10.05', 'conto_utili_a_nuovo', k ? '10.04', 'iva_non_liquidata', v_iva,
      'esercizio_precedente_aperto', v_prima_aperto,
      'ammortamenti_da_registrare', ((v_fine->>'totale_ammortamenti')::numeric > 0 AND NOT (v_fine->>'ammortamenti_registrati')::boolean)
        OR coalesce((v_fine->>'ammortamenti_da_aggiornare')::boolean, false),
      'tfr_da_registrare', (v_fine->>'tfr')::numeric > 0 AND NOT (v_fine->>'tfr_registrato')::boolean);
  END IF;
  IF v_iva <> 0 THEN
    RAISE EXCEPTION 'IVA del % ancora da liquidare (%): registra prima la liquidazione dell''ultimo periodo', p_anno, v_iva USING ERRCODE = '22023';
  END IF;

  -- Il conto dell'utile: quello del piano, oppure si crea sotto il patrimonio netto.
  v_utile_conto := (k->>'10.05')::uuid;
  IF v_utile_conto IS NULL THEN
    SELECT id INTO v_mastro FROM public.contabilita_conti WHERE company_id = p_company AND codice = '10' AND NOT movimentabile;
    INSERT INTO public.contabilita_conti (company_id, codice, descrizione, natura, sezione_cee, voce_cee, movimentabile, mastro_id, codice_standard)
    VALUES (p_company, '10.05', 'Utile (perdita) dell''esercizio', 'passivo', 'SPP', 'A.IX', true, v_mastro, '10.05')
    ON CONFLICT (company_id, codice) DO UPDATE SET codice_standard = '10.05'
    RETURNING id INTO v_utile_conto;
  END IF;

  PERFORM set_config('contabilita.chiusura', 'on', true);
  IF v_n_ce > 0 THEN
    v_righe := v_righe || public.contabilita_riga(v_utile_conto::text, 'avere', v_utile,
      CASE WHEN v_utile >= 0 THEN 'utile dell''esercizio' ELSE 'perdita dell''esercizio' END);
    PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Chiusura conti economici',
      'Epilogo del conto economico ' || p_anno, NULL, NULL, v_righe, 'chiusura', v_id_chiu, NULL);
  END IF;

  IF NOT v_aper_esiste THEN
    -- L'utile (o la perdita) dell'anno chiuso si riapre fra gli utili portati a nuovo, se il piano ha il
    -- conto: altrimenti nel bilancio dell'anno dopo la voce A.IX sommerebbe il vecchio e il nuovo.
    v_a_nuovo := coalesce((k->>'10.04')::uuid, v_utile_conto);
    SELECT jsonb_agg(jsonb_build_object('conto_id', CASE WHEN id = v_utile_conto THEN v_a_nuovo ELSE id END,
                                        CASE WHEN saldo > 0 THEN 'dare' ELSE 'avere' END, abs(saldo),
                                        'descrizione', CASE WHEN id = v_utile_conto AND v_a_nuovo <> v_utile_conto THEN 'risultato ' || p_anno || ' portato a nuovo' END)
                     ORDER BY codice)
      INTO v_aper
      FROM (SELECT c.id, c.codice, sum(r.dare - r.avere) AS saldo
              FROM public.contabilita_righe r
              JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
              JOIN public.contabilita_conti c ON c.id = r.conto_id
             WHERE s.company_id = p_company AND s.esercizio = p_anno AND c.natura IN ('attivo', 'passivo')
             GROUP BY c.id, c.codice HAVING sum(r.dare - r.avere) <> 0) z;
    IF jsonb_array_length(coalesce(v_aper, '[]'::jsonb)) >= 2 THEN
      PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno + 1, 1, 1), 'Apertura conti',
        'Saldi al 31/12/' || p_anno, NULL, make_date(p_anno, 12, 31), v_aper, 'apertura', v_id_aper, NULL);
    END IF;
  END IF;
  PERFORM set_config('contabilita.chiusura', 'off', true);

  INSERT INTO public.contabilita_esercizi (company_id, anno, chiuso_il, chiuso_da, aggiornato_il)
  VALUES (p_company, p_anno, now(), auth.uid(), now())
  ON CONFLICT (company_id, anno) DO UPDATE SET chiuso_il = now(), chiuso_da = auth.uid(), aggiornato_il = now();

  RETURN jsonb_build_object('utile', v_utile, 'conti_economici', v_n_ce, 'conti_patrimoniali', v_n_sp,
    'apertura_registrata', NOT v_aper_esiste, 'apertura_gia_presente', v_aper_esiste);
END $$;

REVOKE TRUNCATE ON public.contabilita_conti, public.contabilita_scritture, public.contabilita_righe, public.contabilita_esercizi,
  public.contabilita_ratei_risconti, public.contabilita_cespiti_quote, public.cg_rimanenze_magazzino FROM authenticated;
-- Dice se un documento di qualunque azienda è registrato: la usano solo le funzioni della contabilità.
REVOKE EXECUTE ON FUNCTION public.contabilita_documento_registrato(uuid, text, uuid) FROM authenticated;
