-- Contabilità generale, lotto 2 (10/11/2026): i movimenti di cassa e l'IVA.
--
-- 1. Prima nota → scritture. Fin qui entravano solo fatture e loro incassi/pagamenti. Restavano
--    fuori i pagamenti dei fornitori registrati in prima nota (Demo: 830 pagamenti, nessuna
--    fattura con pagata_il: i fornitori restavano tutti aperti), le spese senza fattura, gli
--    stipendi, gli F24, gli incassi e le uscite «sciolti» (Vulcano, importati da Mexal).
--    - costo legato a una fattura ricevuta: chiude il fornitore (ritenuta in proporzione) e la
--      fattura non usa più pagata_il, così niente doppioni;
--    - costo senza fattura: costo per cassa sul conto della sua categoria;
--    - senza costo: dalla categoria (pagamento fornitore, incasso, F24, altro);
--    - giroconti fra conti propri: saltati (stesso conto banca, nessun effetto);
--    - un movimento sciolto con la gemella sul documento (stessa data e importo) è saltato:
--      Vulcano ha i pagamenti Mexal sia in prima nota sia come pagata_il delle fatture;
--    - incassi delle fatture: restano dal registro pagamenti e dalla prima nota del documento.
-- 2. F24 pagati (f24_entries): il tributo dice quale debito chiudono.
-- 3. Liquidazione IVA (contabilita_liquida_iva): gira IVA vendite e acquisti del periodo su
--    Erario c/IVA, usando il credito del periodo prima; il versamento la chiude.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.contabilita_genera_da_documenti(p_company uuid, p_anno integer, p_solo uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s' AS $$
DECLARE
  k jsonb;
  v_dal date := make_date(p_anno, 1, 1);
  v_al date := make_date(p_anno, 12, 31);
  e record; r record; v_righe jsonb; v_nc boolean; v_conto text; v_causale text; v_origine text;
  n_em int := 0; n_ric int := 0; n_inc int := 0; n_pag int := 0; n_alt int := 0;
  s_testata int := 0; s_gia int := 0; s_errori jsonb := '[]'::jsonb;
  imp numeric; iva numeric; tot numeric; dif numeric; rit numeric; netto numeric; v_split boolean;
  v_ricavo_altro text; v_costo_altro text; v_indetraibile numeric; v_banca text; v_contro text; n_mov int := 0; s_giro int := 0;
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
   WHERE i.company_id = p_company AND i.deleted_at IS NULL AND i.document_type IN ('invoice', 'credit_note') AND coalesce(i.paid_amount, 0) > 0
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
     AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries pn WHERE pn.company_id = p_company AND pn.cost_id = f.company_cost_id AND f.company_cost_id IS NOT NULL)
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
              AND abs(coalesce(f.netto_a_pagare, f.totale_documento) - pn.amount) < 0.01))
     AND NOT (pn.direction = 'entrata' AND EXISTS (
           SELECT 1 FROM public.invoices i WHERE i.company_id = p_company AND i.deleted_at IS NULL
              AND coalesce(i.payment_date, i.due_date, i.issue_date) = pn.entry_date AND abs(i.paid_amount - pn.amount) < 0.01
           UNION ALL
           SELECT 1 FROM public.invoice_payments ip WHERE ip.company_id = p_company AND ip.payment_date = pn.entry_date AND abs(ip.amount - pn.amount) < 0.01))
  UNION ALL
  SELECT 'f24', f.id, f.data_pagamento, 5 FROM public.f24_entries f
   WHERE f.company_id = p_company AND f.stato = 'pagato' AND f.data_pagamento BETWEEN v_dal AND v_al AND coalesce(f.importo, 0) <> 0
  ) ev(tipo, id, data, ordine)
  WHERE p_solo IS NULL OR ev.id = p_solo
  ORDER BY ev.data, ev.ordine, ev.id
  LOOP
    v_origine := CASE e.tipo WHEN 'emessa' THEN 'fattura_emessa' WHEN 'ricevuta' THEN 'fattura_ricevuta' ELSE e.tipo END;
    IF public.contabilita_documento_registrato(p_company, v_origine, e.id) THEN s_gia := s_gia + 1; CONTINUE; END IF;
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
        PERFORM public.contabilita_inserisci_scrittura(p_company, r.data_emissione, v_causale, r.cliente_snapshot->>'ragione_sociale',
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
          v_conto := public.contabilita_conto_da_categoria(coalesce(r.category, r.categoria_ai));
          IF NOT k ? v_conto THEN v_conto := '30.01'; END IF;
          -- IVA detraibile solo in parte (detraibilita_percentuale): la quota indetraibile è costo.
          v_indetraibile := round(iva * (100 - least(100, greatest(0, coalesce(r.detraibilita_percentuale, 100)))) / 100, 2);
          v_righe := public.contabilita_riga(k->>v_conto, 'dare', imp + v_indetraibile, r.cedente_ragione_sociale)
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
        PERFORM public.contabilita_inserisci_scrittura(p_company, r.data_fattura, v_causale, r.cedente_ragione_sociale,
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
        PERFORM public.contabilita_inserisci_scrittura(p_company, r.payment_date,
          CASE WHEN tot < 0 THEN 'Rimborso nota di credito' ELSE 'Incasso fattura' END, r.client_company_name,
          r.invoice_number, NULL, v_righe, v_origine, e.id, NULL);
        n_inc := n_inc + 1;

      ELSIF e.tipo = 'incasso_fattura' THEN
        SELECT i.paid_amount, i.invoice_number, i.client_company_name, i.document_type INTO r FROM public.invoices i WHERE i.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Nota di credito «pagata»: rimborsata o compensata, in ogni caso esce dal credito verso il cliente.
        tot := CASE WHEN r.document_type = 'credit_note' THEN -r.paid_amount ELSE r.paid_amount END;
        v_righe := public.contabilita_riga(k->>'06.01', 'dare', tot, NULL)
                || public.contabilita_riga(k->>'05.01', 'avere', tot, r.client_company_name);
        PERFORM public.contabilita_inserisci_scrittura(p_company, e.data,
          CASE WHEN tot < 0 THEN 'Rimborso nota di credito' ELSE 'Incasso fattura' END, r.client_company_name,
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
        PERFORM public.contabilita_inserisci_scrittura(p_company, e.data,
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
        PERFORM public.contabilita_inserisci_scrittura(p_company, e.data, 'Ritenuta d''acconto subita', r.cliente,
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
        PERFORM public.contabilita_inserisci_scrittura(p_company, e.data, 'Pagamento fornitore', r.cedente_ragione_sociale,
          r.numero_fattura, NULL, v_righe, v_origine, e.id, NULL);
        n_pag := n_pag + 1;

      ELSIF e.tipo = 'prima_nota' THEN
        SELECT pn.*, c.category AS costo_categoria, c.name AS costo_nome, f.id AS fattura_id, f.cedente_ragione_sociale, f.netto_a_pagare,
               f.ritenuta_importo, f.totale_documento AS fattura_totale, f.trattenuta_garanzia, f.tipo_documento, f.imponibile_totale AS fattura_imponibile
          INTO r
          FROM public.prima_nota_entries pn
          LEFT JOIN public.company_costs c ON c.id = pn.cost_id
          LEFT JOIN LATERAL (SELECT * FROM public.fatture_ricevute x WHERE x.company_cost_id = pn.cost_id AND pn.cost_id IS NOT NULL
                              ORDER BY x.data_fattura LIMIT 1) f ON true
         WHERE pn.id = e.id;
        v_banca := CASE WHEN lower(coalesce(r.account_label, '')) LIKE 'cassa%' AND k ? '06.02' THEN '06.02' ELSE '06.01' END;
        -- Importo con segno dal punto di vista della contropartita: uscita = dare, entrata (anche storno) = avere.
        tot := CASE WHEN r.direction = 'uscita' THEN abs(r.amount) ELSE -abs(r.amount) END;
        IF lower(coalesce(r.category, '')) ~ 'giroconto' THEN s_giro := s_giro + 1; CONTINUE; END IF;
        IF r.fattura_id IS NOT NULL THEN
          -- Pagamento (o storno del pagamento) di una fattura ricevuta: chiude il fornitore.
          IF NOT public.contabilita_documento_registrato(p_company, 'fattura_ricevuta', r.fattura_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
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
          v_causale := CASE
            WHEN v_conto = '13.04' THEN 'Pagamento fornitore'
            WHEN v_conto = '05.01' THEN 'Incasso da cliente'
            WHEN v_conto IN ('13.13', '13.11') THEN 'Versamento F24'
            WHEN r.direction = 'entrata' THEN 'Entrata di prima nota'
            ELSE 'Uscita di prima nota' END;
        END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, e.data, v_causale, coalesce(r.description, v_contro),
          r.reference_number, NULL, v_righe, v_origine, e.id, NULL);
        n_mov := n_mov + 1;

      ELSIF e.tipo = 'f24' THEN
        SELECT * INTO r FROM public.f24_entries WHERE id = e.id;
        -- Il tributo dice quale debito si chiude: IVA, ritenute, contributi, imposte.
        v_conto := CASE
          WHEN r.tributo_code ~ '^60(0[1-9]|1[0-2]|3[1-8]|99)$' OR r.tributo_code IN ('6035', '6040', '6041') THEN '13.11'
          WHEN r.tributo_code ~ '^10[0-9]{2}$' OR r.tributo_code ~ '^1[0-9]{3}$' AND r.tributo_code < '1100' THEN '13.12'
          WHEN r.tributo_code ~ '^[A-Z]' THEN '13.20'
          ELSE '13.13' END;
        IF NOT k ? v_conto THEN v_conto := CASE WHEN k ? '13.13' THEN '13.13' WHEN k ? '13.11' THEN '13.11' ELSE '30.40' END; END IF;
        v_righe := public.contabilita_riga(k->>v_conto, 'dare', r.importo, concat_ws(' ', 'tributo', r.tributo_code, r.tributo_descrizione))
                || public.contabilita_riga(k->>'06.01', 'avere', r.importo, NULL);
        PERFORM public.contabilita_inserisci_scrittura(p_company, e.data, 'Versamento F24',
          concat_ws(' ', 'F24', lpad(r.mese::text, 2, '0') || '/' || r.anno, r.tributo_code), r.tributo_code, NULL, v_righe, v_origine, e.id, NULL);
        n_mov := n_mov + 1;
      END IF;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('%s %s del %s: %s', e.tipo, e.id, to_char(e.data, 'DD/MM/YYYY'), SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'fatture_emesse', n_em, 'fatture_ricevute', n_ric, 'incassi', n_inc, 'pagamenti', n_pag, 'altre', n_alt,
    'movimenti', n_mov, 'giroconti_saltati', s_giro,
    'saltate_solo_testata', s_testata, 'gia_generate', s_gia, 'errori', s_errori);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_genera_da_documenti(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_genera_da_documenti(uuid, integer, uuid) TO authenticated, service_role;

-- ─── Liquidazione IVA del periodo ───────────────────────────────────────────
-- Gira i movimenti del periodo di IVA vendite (13.10) e IVA acquisti (05.10) su Erario c/IVA:
-- a debito (13.11) o a credito (05.11; se manca, lo stesso 13.11). Un credito dei periodi prima
-- abbatte il debito. Una sola per periodo (si storna e si rifà se servisse).
CREATE OR REPLACE FUNCTION public.contabilita_liquida_iva(p_company uuid, p_dal date, p_al date, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb; v_id uuid; v_vendite numeric; v_acquisti numeric; v_saldo numeric; v_credito_prec numeric := 0;
  v_compensato numeric := 0; v_conto_credito text; v_righe jsonb; v_scrittura uuid;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_dal IS NULL OR p_al IS NULL OR p_al < p_dal OR extract(year FROM p_dal) <> extract(year FROM p_al) THEN
    RAISE EXCEPTION 'Periodo non valido' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  SELECT coalesce(jsonb_object_agg(chiave, id), '{}'::jsonb) INTO k FROM (
    SELECT DISTINCT ON (chiave) chiave, id FROM (
      SELECT coalesce(codice_standard, codice) AS chiave, id, codice_standard IS NOT NULL AS esplicito, codice
        FROM public.contabilita_conti WHERE company_id = p_company AND movimentabile AND attivo
    ) x ORDER BY chiave, esplicito DESC, codice
  ) y;
  IF NOT (k ? '13.10' AND k ? '05.10' AND k ? '13.11') THEN
    RAISE EXCEPTION 'Mancano i conti IVA su vendite, IVA su acquisti ed Erario c/IVA (13.10, 05.10, 13.11)' USING ERRCODE = '22023';
  END IF;
  v_conto_credito := CASE WHEN k ? '05.11' THEN '05.11' ELSE '13.11' END;
  v_id := md5('liquidazione-iva:' || p_company || ':' || p_dal || ':' || p_al)::uuid;

  SELECT coalesce(sum(r.avere - r.dare) FILTER (WHERE r.conto_id = (k->>'13.10')::uuid), 0),
         coalesce(sum(r.dare - r.avere) FILTER (WHERE r.conto_id = (k->>'05.10')::uuid), 0)
    INTO v_vendite, v_acquisti
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND s.data_registrazione BETWEEN p_dal AND p_al
     AND s.origine IS DISTINCT FROM 'liquidazione_iva'
     AND NOT (s.origine = 'storno' AND EXISTS (SELECT 1 FROM public.contabilita_scritture o WHERE o.id = s.storno_di AND o.origine = 'liquidazione_iva'));
  -- Credito dei periodi prima: saldo dare del conto del credito fino al giorno prima.
  SELECT coalesce(sum(r.dare - r.avere), 0) INTO v_credito_prec
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND r.conto_id = (k->>v_conto_credito)::uuid AND s.data_registrazione < p_dal;
  v_credito_prec := greatest(v_credito_prec, 0);
  v_saldo := v_vendite - v_acquisti;
  IF v_saldo > 0 THEN v_compensato := least(v_credito_prec, v_saldo); END IF;

  IF NOT p_anteprima THEN
    IF public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id) THEN
      RAISE EXCEPTION 'Questo periodo è già liquidato: storna la liquidazione per rifarla' USING ERRCODE = '23505';
    END IF;
    IF v_vendite = 0 AND v_acquisti = 0 THEN RAISE EXCEPTION 'Nessuna IVA da liquidare nel periodo' USING ERRCODE = '22023'; END IF;
    v_righe := public.contabilita_riga(k->>'13.10', 'dare', v_vendite, 'IVA su vendite del periodo')
            || public.contabilita_riga(k->>'05.10', 'avere', v_acquisti, 'IVA su acquisti del periodo')
            || public.contabilita_riga(k->>v_conto_credito, 'avere', v_compensato, 'credito dei periodi precedenti');
    IF v_saldo > 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'13.11', 'avere', v_saldo - v_compensato, 'IVA da versare');
    ELSE
      v_righe := v_righe || public.contabilita_riga(k->>v_conto_credito, 'dare', -v_saldo, 'IVA a credito');
    END IF;
    v_scrittura := public.contabilita_inserisci_scrittura(p_company, p_al, 'Liquidazione IVA',
      'Liquidazione IVA dal ' || to_char(p_dal, 'DD/MM/YYYY') || ' al ' || to_char(p_al, 'DD/MM/YYYY'),
      NULL, NULL, v_righe, 'liquidazione_iva', v_id, NULL);
  END IF;
  RETURN jsonb_build_object('iva_vendite', v_vendite, 'iva_acquisti', v_acquisti, 'saldo', v_saldo,
    'credito_precedente', v_credito_prec, 'compensato', v_compensato,
    'da_versare', greatest(v_saldo - v_compensato, 0), 'a_credito', greatest(-v_saldo, 0),
    'gia_liquidato', public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id),
    'scrittura_id', v_scrittura);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_liquida_iva(uuid, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_liquida_iva(uuid, date, date, boolean) TO authenticated, service_role;
