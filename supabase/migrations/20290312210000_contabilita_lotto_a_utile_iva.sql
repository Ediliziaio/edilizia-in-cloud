-- Contabilità generale, lotto A delle correzioni dal controllo dell'11/11/2026: quello che falsava utile e IVA.
--
-- 1. Prima nota: entrate da clienti sui crediti; finanziamenti, mutui e prestiti (categoria, o
--    «erogazione/rata mutuo» nella descrizione) su Finanziamenti; anticipo fatture su debiti verso
--    banche; versamenti dei soci su Altre riserve; dividendi su utili a nuovo. Un'entrata che non si
--    sa cosa sia va su «Partite da verificare» (13.90, nuovo nel piano standard) con un avviso, non
--    più fra i ricavi.
-- 2. Note di credito, emesse e ricevute (anche passive_credit_note di Fatture in Cloud): ogni importo
--    col suo segno, anche se arrivano positivi o misti. Prima erano registrate come fatture.
-- 3. Autofatture (self_invoice): come le integrazioni estere; se c'è anche la fattura del fornitore,
--    solo l'IVA.
-- 4. Reverse charge edile (righe N6.x senza TD16): IVA integrata al 22%, a debito e a credito per la
--    parte detraibile; senza categoria, il costo è un subappalto.
-- 5. Split payment delle fatture importate alla PA (codice destinatario di 6 caratteri).
-- 6. Differenze fra totale e imponibile più IVA: bollo e centesimi come prima, cassa previdenziale
--    sul costo, il resto oltre 1 € su «Partite da verificare» con un avviso; un documento col solo
--    totale non si registra (e se c'era si storna), con un avviso.
--    Un conto di categoria che manca nel piano va su «Partite da verificare» (prima su oneri diversi).
--    Senza il conto 13.90 (piani propri) le cose restano dove andavano, ma con un avviso.
-- La generazione restituisce «avvisi». Funzioni riprese intere dalla produzione, cambiate nei punti detti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- Storna la scrittura viva di un documento, se c'è (il documento non si può più registrare così).
CREATE OR REPLACE FUNCTION public.contabilita_storna_viva(p_company uuid, p_origine text, p_id uuid, p_motivo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.contabilita_scritture;
BEGIN
  SELECT s.* INTO v FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = p_origine AND s.origine_id = p_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  IF v.id IS NULL THEN RETURN false; END IF;
  PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v.data_registrazione),
    'Storno n. ' || v.numero || '/' || v.esercizio, p_motivo, v.documento_numero, v.documento_data,
    (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
       FROM public.contabilita_righe WHERE scrittura_id = v.id), 'storno', v.id, v.id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_storna_viva(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

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
  v_avvisi jsonb := '[]'::jsonb; v_da_verificare text; v_dif_conto text; v_n6 boolean; v_rc_imp numeric; v_rc_iva numeric; v_rc_detr numeric; v_cat text;
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
  -- Dove va quello che il programma non sa classificare: un conto da guardare, non un ricavo o un costo.
  v_da_verificare := CASE WHEN k ? '13.90' THEN '13.90' END;

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
     AND f.tipo_documento NOT IN ('TD04', 'TD08', 'TD16', 'passive_credit_note')
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
    IF e.tipo NOT IN ('cedolini', 'incasso_fattura', 'emessa', 'ricevuta', 'sparita') AND public.contabilita_documento_registrato(p_company, v_origine, e.id) THEN
      s_gia := s_gia + 1;
      -- Un movimento già registrato su «Partite da verificare» resta da guardare a ogni giro, finché non si classifica.
      IF e.tipo = 'prima_nota' AND v_da_verificare IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.contabilita_scritture s JOIN public.contabilita_righe rr ON rr.scrittura_id = s.id
            WHERE s.company_id = p_company AND s.origine = 'prima_nota' AND s.origine_id = e.id AND rr.conto_id = (k->>v_da_verificare)::uuid
              AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)) THEN
        v_avvisi := v_avvisi || to_jsonb(format('Movimento di prima nota del %s: è su «Partite da verificare», va classificato.', to_char(e.data, 'DD/MM/YYYY')));
      END IF;
      CONTINUE;
    END IF;
    v_righe := '[]'::jsonb;
    BEGIN
      IF e.tipo = 'emessa' THEN
        SELECT * INTO r FROM public.fatture_vendite_iva WHERE id = e.id AND company_id = p_company;
        IF r.imponibile_totale IS NULL OR r.totale_documento IS NULL THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Importi con segno: positivi = fattura, negativi = nota di credito (anche riga per riga).
        imp := r.imponibile_totale; iva := coalesce(r.iva_totale, 0); tot := r.totale_documento;
        -- Nota di credito: ogni importo col suo segno, anche se arriva positivo o misto (Fatture in Cloud).
        IF r.tipo = 'nota_credito' THEN imp := -abs(imp); iva := -abs(iva); tot := -abs(tot); END IF;
        v_nc := imp + iva < 0;
        -- Split payment: dichiarato sul documento, oppure fattura alla PA (codice destinatario di 6
        -- caratteri) importata, dove l'esigibilità non arriva.
        v_split := coalesce(r.esigibilita_iva, 'I') = 'S'
          OR (iva <> 0 AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = e.id AND btrim(coalesce(i.client_sdi_code, '')) ~ '^[A-Z0-9]{6}$'));
        IF v_split THEN tot := tot - iva; iva := 0; END IF;  -- il cliente paga senza IVA, la versa l'ente
        dif := round(tot - imp - iva, 2);
        IF imp = 0 AND iva = 0 AND tot = 0 THEN CONTINUE; END IF;
        -- Solo il totale, senza imponibile né IVA: non si sa cosa sia. Non si registra (e se c'era, si storna).
        IF imp = 0 AND iva = 0 THEN
          PERFORM public.contabilita_storna_viva(p_company, v_origine, e.id, 'Documento senza imponibile né IVA: da completare');
          s_testata := s_testata + 1;
          v_avvisi := v_avvisi || to_jsonb(format('Fattura emessa %s del %s: c''è solo il totale (%s €), senza imponibile né IVA. Non è nel giornale.',
            r.numero, to_char(r.data_emissione, 'DD/MM/YYYY'), tot));
          CONTINUE;
        END IF;
        -- La differenza fra totale e imponibile più IVA: il bollo (2 €) e i centesimi sono altri ricavi;
        -- oltre 1 € è da guardare (acconti, sconti, spese) e va su «Partite da verificare».
        v_dif_conto := v_ricavo_altro;
        IF abs(dif) > 1 AND abs(abs(dif) - 2) >= 0.005 AND v_da_verificare IS NOT NULL THEN
          v_dif_conto := v_da_verificare;
          v_avvisi := v_avvisi || to_jsonb(format('Fattura emessa %s del %s: %s € fra totale e imponibile più IVA, su «Partite da verificare».',
            r.numero, to_char(r.data_emissione, 'DD/MM/YYYY'), dif));
        ELSIF abs(dif) > 1 AND abs(abs(dif) - 2) >= 0.005 THEN
          v_avvisi := v_avvisi || to_jsonb(format('Fattura emessa %s del %s: %s € fra totale e imponibile più IVA, messi fra gli altri ricavi (manca il conto «Partite da verificare», 13.90).',
            r.numero, to_char(r.data_emissione, 'DD/MM/YYYY'), dif));
        END IF;
        v_righe := public.contabilita_riga(k->>'05.01', 'dare', tot, r.cliente_snapshot->>'ragione_sociale')
                || public.contabilita_riga(k->>'20.01', 'avere', imp, NULL)
                || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL)
                || public.contabilita_riga(k->>v_dif_conto, 'avere', dif, CASE WHEN v_dif_conto = v_da_verificare THEN 'differenza da verificare'
                     WHEN dif * sign(tot) > 0 THEN 'bollo e spese fuori imponibile' ELSE 'arrotondamenti e abbuoni' END);
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
        -- Nota di credito (anche quelle di Fatture in Cloud): ogni importo col suo segno.
        IF r.tipo_documento IN ('TD04', 'TD08', 'passive_credit_note') THEN imp := -abs(imp); iva := -abs(iva); tot := -abs(tot); END IF;
        v_nc := imp + iva < 0;
        IF imp = 0 AND iva = 0 THEN
          IF coalesce(tot, 0) <> 0 THEN
            PERFORM public.contabilita_storna_viva(p_company, v_origine, e.id, 'Documento senza imponibile né IVA: da completare');
            s_testata := s_testata + 1;
            v_avvisi := v_avvisi || to_jsonb(format('Fattura ricevuta %s del %s: c''è solo il totale (%s €), senza imponibile né IVA. Non è nel giornale.',
              r.numero_fattura, to_char(r.data_fattura, 'DD/MM/YYYY'), tot));
          END IF;
          CONTINUE;
        END IF;
        -- Reverse charge interno (edilizia, N6.x) senza la sua integrazione TD16: l'IVA si integra qui.
        SELECT coalesce(sum(coalesce(nullif(x->>'imponibile', '')::numeric, 0)), 0) INTO v_rc_imp
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.righe) = 'array' THEN r.righe ELSE '[]'::jsonb END) x
         WHERE x->>'natura_iva' LIKE 'N6%';
        IF v_rc_imp = 0 THEN
          SELECT coalesce(sum(coalesce(nullif(x->>'imponibile', '')::numeric, 0)), 0) INTO v_rc_imp
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.riepilogo_iva) = 'array' THEN r.riepilogo_iva ELSE '[]'::jsonb END) x
           WHERE x->>'natura' LIKE 'N6%';
        END IF;
        v_rc_imp := abs(v_rc_imp) * CASE WHEN v_nc THEN -1 ELSE 1 END;
        v_n6 := v_rc_imp <> 0 AND r.tipo_documento NOT IN ('TD16', 'TD17', 'TD18', 'TD19', 'self_invoice')
          AND NOT EXISTS (SELECT 1 FROM public.fatture_ricevute g WHERE g.company_id = p_company AND g.tipo_documento = 'TD16'
                            AND g.cedente_piva IS NOT DISTINCT FROM r.cedente_piva AND abs(abs(g.imponibile_totale) - abs(v_rc_imp)) < 0.01);
        IF r.tipo_documento = 'TD16' OR (r.tipo_documento = 'self_invoice' AND EXISTS (
             -- Autofattura di cui c'è anche la fattura del fornitore: costo e debito vengono da quella.
             SELECT 1 FROM public.fatture_ricevute g WHERE g.company_id = p_company AND g.id <> r.id AND g.tipo_documento <> 'self_invoice'
                AND g.cedente_piva IS NOT DISTINCT FROM r.cedente_piva AND abs(abs(g.imponibile_totale) - abs(imp)) < 0.01
                AND abs(g.data_fattura - r.data_fattura) <= 31)) THEN
          -- Reverse charge interno: il costo e il debito verso il fornitore vengono dalla sua fattura.
          IF iva = 0 THEN CONTINUE; END IF;
          v_righe := public.contabilita_riga(k->>'05.10', 'dare', iva, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL);
          v_causale := CASE WHEN r.tipo_documento = 'TD16' THEN 'Integrazione IVA reverse charge (TD16)' ELSE 'Integrazione IVA (autofattura)' END;
        ELSE
          v_cat := coalesce(r.category, r.categoria_ai);
          -- Senza categoria, una fattura in reverse charge edile è un subappalto.
          v_conto := public.contabilita_ruolo_disponibile(k, CASE WHEN v_cat IS NULL AND v_n6 THEN '30.02' ELSE public.contabilita_conto_da_categoria(v_cat) END);
          -- IVA detraibile solo in parte (detraibilita_percentuale): la quota indetraibile è costo.
          v_indetraibile := round(iva * (100 - least(100, greatest(0, coalesce(r.detraibilita_percentuale, 100)))) / 100, 2);
          -- Il costo si divide per conto, riga per riga (conti_righe); il resto sul conto della fattura.
          v_righe := public.contabilita_righe_costo(k, r.righe, r.conti_righe, imp, v_indetraibile, v_conto, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>'05.10', 'dare', iva - v_indetraibile, NULL);
          IF r.tipo_documento IN ('TD17', 'TD18', 'TD19', 'self_invoice') AND iva <> 0 THEN
            -- Integrazione estera e autofattura: il fornitore è debitore del solo imponibile, l'IVA va anche fra i debiti.
            v_righe := v_righe || public.contabilita_riga(k->>'13.04', 'avere', imp, r.cedente_ragione_sociale)
                               || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL);
            v_causale := 'Integrazione reverse charge';
          ELSE
            -- Qualche fornitore scrive il totale già al netto della ritenuta d'acconto: il debito verso di
            -- lui è comunque imponibile più IVA (la ritenuta si toglie al pagamento, verso l'Erario), e
            -- la differenza non è un abbuono.
            IF coalesce(r.ritenuta_importo, 0) > 0 AND abs(tot - imp - iva + r.ritenuta_importo * sign(tot)) < 0.02 THEN
              tot := imp + iva;
            END IF;
            dif := round(tot - imp - iva, 2);
            -- La differenza: bollo e centesimi sono oneri diversi; la cassa previdenziale fuori imponibile
            -- è costo della fattura; il resto oltre 1 € va su «Partite da verificare».
            v_dif_conto := v_costo_altro;
            IF abs(dif) > 1 AND abs(abs(dif) - abs(coalesce(r.bollo_importo, 0))) >= 0.01 THEN
              IF coalesce(r.cassa_previdenziale, 0) <> 0 AND (abs(abs(dif) - abs(r.cassa_previdenziale)) < 0.02
                   OR abs(abs(dif) - round(abs(r.cassa_previdenziale) * 1.22, 2)) < 0.02) THEN
                v_dif_conto := v_conto;
              ELSIF v_da_verificare IS NOT NULL THEN
                v_dif_conto := v_da_verificare;
                v_avvisi := v_avvisi || to_jsonb(format('Fattura ricevuta %s del %s: %s € fra totale e imponibile più IVA, su «Partite da verificare».',
                  r.numero_fattura, to_char(r.data_fattura, 'DD/MM/YYYY'), dif));
              ELSE
                v_avvisi := v_avvisi || to_jsonb(format('Fattura ricevuta %s del %s: %s € fra totale e imponibile più IVA, messi fra gli oneri diversi (manca il conto «Partite da verificare», 13.90).',
                  r.numero_fattura, to_char(r.data_fattura, 'DD/MM/YYYY'), dif));
              END IF;
            END IF;
            v_righe := v_righe || public.contabilita_riga(k->>'13.04', 'avere', tot, r.cedente_ragione_sociale)
                               || public.contabilita_riga(k->>v_dif_conto, 'dare', dif, CASE WHEN v_dif_conto = v_da_verificare THEN 'differenza da verificare'
                                    WHEN v_dif_conto = v_conto THEN 'cassa previdenziale' WHEN dif * sign(tot) > 0 THEN 'bollo e spese fuori imponibile' ELSE 'arrotondamenti e abbuoni' END);
            v_causale := CASE WHEN v_nc THEN 'Nota di credito ricevuta' ELSE 'Fattura ricevuta' END;
            IF v_n6 THEN
              -- Reverse charge edile: l'IVA si integra (a debito e, per la parte detraibile, a credito).
              v_rc_iva := round(v_rc_imp * 22 / 100, 2);
              v_rc_detr := round(v_rc_iva * least(100, greatest(0, coalesce(r.detraibilita_percentuale, 100))) / 100, 2);
              v_righe := v_righe || public.contabilita_riga(k->>'05.10', 'dare', v_rc_detr, 'IVA reverse charge integrata')
                                 || public.contabilita_riga(k->>v_conto, 'dare', v_rc_iva - v_rc_detr, 'IVA reverse charge indetraibile')
                                 || public.contabilita_riga(k->>'13.10', 'avere', v_rc_iva, 'IVA reverse charge integrata');
              v_causale := CASE WHEN v_nc THEN 'Nota di credito ricevuta (reverse charge)' ELSE 'Fattura ricevuta (reverse charge)' END;
            END IF;
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
        -- Fattura alla PA in split payment: l'ente paga il solo imponibile, anche se l'import la segna
        -- pagata per intero (l'IVA la versa lui all'Erario).
        IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = e.id AND coalesce(i.tax_amount, 0) <> 0
                     AND btrim(coalesce(i.client_sdi_code, '')) ~ '^[A-Z0-9]{6}$') THEN
          tot := sign(tot) * least(abs(tot), (SELECT abs(i.total) - abs(i.tax_amount) FROM public.invoices i WHERE i.id = e.id));
        END IF;
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
            WHEN r.direction = 'entrata' AND lower(coalesce(r.category, '')) ~ 'client' THEN '05.01'
            -- Movimenti che non sono né ricavi né costi: denaro preso o reso in prestito, soci, utili.
            WHEN r.cost_id IS NULL AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) !~ '(spes[ae]|interess|commission|istruttori)'
                 AND (lower(coalesce(r.category, '')) ~ '(finanziament|mutuo|prestit)'
                 OR lower(coalesce(r.description, '')) ~ '(erogazione|rata)( del| di)? (mutuo|finanziamento|prestito)') THEN '13.02'
            WHEN r.cost_id IS NULL AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) ~ '(anticipo (su )?fattur|anticipo sbf|\msbf\M)'
                 AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) !~ '(spes[ae]|interess|commission)' THEN '13.01'
            WHEN r.cost_id IS NULL AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) ~ '(versament[oi] (dei |del )?soci|conto capitale|aumento (di )?capitale)' THEN '10.03'
            WHEN r.cost_id IS NULL AND r.direction = 'uscita' AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) ~ '(dividend|distribuzione (degli )?utili)' THEN '10.04'
            WHEN lower(coalesce(r.category, '')) ~ '(fiscal|f24|tribut|impost|tass)' AND r.cost_id IS NULL THEN
              CASE WHEN k ? '13.13' THEN '13.13' WHEN k ? '13.11' THEN '13.11' ELSE '30.40' END
            WHEN r.cost_id IS NOT NULL THEN public.contabilita_conto_da_categoria(coalesce(r.costo_categoria, r.category))
            -- Un'entrata che non si sa cosa sia non è un ricavo: si guarda.
            WHEN r.direction = 'entrata' THEN coalesce(v_da_verificare, v_ricavo_altro)
            WHEN lower(coalesce(r.category, '')) IN ('', 'altro', 'altre') THEN v_costo_altro
            ELSE public.contabilita_conto_da_categoria(r.category)
          END;
          IF NOT k ? v_conto THEN
            IF v_conto IN ('13.02', '13.01', '10.03', '10.04') THEN
              v_avvisi := v_avvisi || to_jsonb(format('Movimento del %s (%s €): serve il conto %s nel piano, registrato su %s.',
                to_char(r.entry_date, 'DD/MM/YYYY'), abs(r.amount), v_conto, coalesce(v_da_verificare, 'altri ricavi/oneri diversi')));
            END IF;
            v_conto := coalesce(v_da_verificare, CASE WHEN r.direction = 'entrata' THEN v_ricavo_altro ELSE v_costo_altro END);
          END IF;
          IF v_conto = v_da_verificare OR (v_da_verificare IS NULL AND r.direction = 'entrata' AND v_conto = v_ricavo_altro AND r.cost_id IS NULL
               AND lower(coalesce(r.category, '')) !~ '(ricav|vendit|rimbors|interess|contribut)') THEN
            v_avvisi := v_avvisi || to_jsonb(format('Movimento di prima nota del %s (%s €, «%s»): %s, va classificato.',
              to_char(r.entry_date, 'DD/MM/YYYY'), abs(r.amount), coalesce(r.description, r.category, ''),
              CASE WHEN v_conto = v_da_verificare THEN 'su «Partite da verificare»' ELSE 'messo fra gli altri ricavi (manca il conto «Partite da verificare», 13.90)' END));
          END IF;
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
    'saltate_solo_testata', s_testata, 'gia_generate', s_gia, 'riallineate', n_rif, 'errori', s_errori,
    'avvisi', v_avvisi);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_piano_standard(p_company uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  WITH p(codice, descrizione, natura, sezione, voce, mastro) AS (VALUES
    ('01', 'Immobilizzazioni immateriali', 'attivo', 'SPA', 'B.I', NULL),
    ('01.01', 'Software e licenze', 'attivo', 'SPA', 'B.I.3', '01'),
    ('01.02', 'Altre immobilizzazioni immateriali', 'attivo', 'SPA', 'B.I.7', '01'),
    ('02', 'Immobilizzazioni materiali', 'attivo', 'SPA', 'B.II', NULL),
    ('02.01', 'Terreni e fabbricati', 'attivo', 'SPA', 'B.II.1', '02'),
    ('02.02', 'Impianti e macchinari', 'attivo', 'SPA', 'B.II.2', '02'),
    ('02.03', 'Attrezzature di cantiere', 'attivo', 'SPA', 'B.II.3', '02'),
    ('02.04', 'Automezzi', 'attivo', 'SPA', 'B.II.4', '02'),
    ('02.05', 'Mobili e macchine d''ufficio', 'attivo', 'SPA', 'B.II.4', '02'),
    ('02.90', 'Fondo ammortamento fabbricati', 'attivo', 'SPA', 'B.II.1', '02'),
    ('02.91', 'Fondo ammortamento impianti e macchinari', 'attivo', 'SPA', 'B.II.2', '02'),
    ('02.92', 'Fondo ammortamento attrezzature', 'attivo', 'SPA', 'B.II.3', '02'),
    ('02.93', 'Fondo ammortamento altri beni', 'attivo', 'SPA', 'B.II.4', '02'),
    ('03', 'Immobilizzazioni finanziarie', 'attivo', 'SPA', 'B.III', NULL),
    ('03.01', 'Partecipazioni', 'attivo', 'SPA', 'B.III.1', '03'),
    ('04', 'Rimanenze', 'attivo', 'SPA', 'C.I', NULL),
    ('04.01', 'Materie prime e materiali', 'attivo', 'SPA', 'C.I.1', '04'),
    ('04.02', 'Lavori in corso su ordinazione', 'attivo', 'SPA', 'C.I.3', '04'),
    ('05', 'Crediti', 'attivo', 'SPA', 'C.II', NULL),
    ('05.01', 'Crediti verso clienti', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.02', 'Fatture da emettere', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.03', 'Ritenute a garanzia da incassare', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.10', 'IVA su acquisti', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.11', 'Erario c/IVA a credito', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.12', 'Crediti d''imposta e acconti', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.20', 'Crediti diversi', 'attivo', 'SPA', 'C.II.5-quater', '05'),
    ('05.21', 'Anticipi a fornitori', 'attivo', 'SPA', 'C.II.5-quater', '05'),
    ('06', 'Disponibilità liquide', 'attivo', 'SPA', 'C.IV', NULL),
    ('06.01', 'Banca c/c', 'attivo', 'SPA', 'C.IV.1', '06'),
    ('06.02', 'Cassa', 'attivo', 'SPA', 'C.IV.3', '06'),
    ('07', 'Ratei e risconti attivi', 'attivo', 'SPA', 'D', NULL),
    ('07.01', 'Ratei attivi', 'attivo', 'SPA', 'D', '07'),
    ('07.02', 'Risconti attivi', 'attivo', 'SPA', 'D', '07'),
    ('10', 'Patrimonio netto', 'passivo', 'SPP', 'A', NULL),
    ('10.01', 'Capitale sociale', 'passivo', 'SPP', 'A.I', '10'),
    ('10.02', 'Riserva legale', 'passivo', 'SPP', 'A.IV', '10'),
    ('10.03', 'Altre riserve', 'passivo', 'SPP', 'A.VI', '10'),
    ('10.04', 'Utili (perdite) portati a nuovo', 'passivo', 'SPP', 'A.VIII', '10'),
    ('10.05', 'Utile (perdita) dell''esercizio', 'passivo', 'SPP', 'A.IX', '10'),
    ('11', 'Fondi per rischi e oneri', 'passivo', 'SPP', 'B', NULL),
    ('11.01', 'Fondo rischi', 'passivo', 'SPP', 'B.4', '11'),
    ('12', 'Trattamento di fine rapporto', 'passivo', 'SPP', 'C', NULL),
    ('12.01', 'Fondo TFR', 'passivo', 'SPP', 'C', '12'),
    ('13', 'Debiti', 'passivo', 'SPP', 'D', NULL),
    ('13.01', 'Debiti verso banche', 'passivo', 'SPP', 'D.4', '13'),
    ('13.02', 'Finanziamenti', 'passivo', 'SPP', 'D.4', '13'),
    ('13.03', 'Acconti da clienti', 'passivo', 'SPP', 'D.6', '13'),
    ('13.04', 'Debiti verso fornitori', 'passivo', 'SPP', 'D.7', '13'),
    ('13.05', 'Fatture da ricevere', 'passivo', 'SPP', 'D.7', '13'),
    ('13.06', 'Ritenute a garanzia verso subappaltatori', 'passivo', 'SPP', 'D.7', '13'),
    ('13.10', 'IVA su vendite', 'passivo', 'SPP', 'D.12', '13'),
    ('13.11', 'Erario c/IVA a debito', 'passivo', 'SPP', 'D.12', '13'),
    ('13.12', 'Erario c/ritenute', 'passivo', 'SPP', 'D.12', '13'),
    ('13.13', 'Debiti per imposte', 'passivo', 'SPP', 'D.12', '13'),
    ('13.20', 'Debiti verso istituti previdenziali', 'passivo', 'SPP', 'D.13', '13'),
    ('13.30', 'Debiti verso dipendenti', 'passivo', 'SPP', 'D.14', '13'),
    ('13.31', 'Debiti diversi', 'passivo', 'SPP', 'D.14', '13'),
    ('13.90', 'Partite da verificare', 'passivo', 'SPP', 'D.14', '13'),
    ('14', 'Ratei e risconti passivi', 'passivo', 'SPP', 'E', NULL),
    ('14.01', 'Ratei passivi', 'passivo', 'SPP', 'E', '14'),
    ('14.02', 'Risconti passivi', 'passivo', 'SPP', 'E', '14'),
    ('20', 'Valore della produzione', 'ricavo', 'CE', 'A', NULL),
    ('20.01', 'Ricavi da lavori e prestazioni', 'ricavo', 'CE', 'A.1', '20'),
    ('20.02', 'Ricavi da vendite', 'ricavo', 'CE', 'A.1', '20'),
    ('20.03', 'Variazione lavori in corso su ordinazione', 'ricavo', 'CE', 'A.3', '20'),
    ('20.04', 'Altri ricavi e proventi', 'ricavo', 'CE', 'A.5', '20'),
    ('20.05', 'Contributi in conto esercizio', 'ricavo', 'CE', 'A.5', '20'),
    ('30', 'Costi della produzione', 'costo', 'CE', 'B', NULL),
    ('30.01', 'Acquisto materiali', 'costo', 'CE', 'B.6', '30'),
    ('30.02', 'Subappalti', 'costo', 'CE', 'B.7', '30'),
    ('30.03', 'Servizi e consulenze', 'costo', 'CE', 'B.7', '30'),
    ('30.04', 'Utenze', 'costo', 'CE', 'B.7', '30'),
    ('30.05', 'Carburanti e trasporti', 'costo', 'CE', 'B.7', '30'),
    ('30.06', 'Noli e godimento beni di terzi', 'costo', 'CE', 'B.8', '30'),
    ('30.07', 'Affitti passivi', 'costo', 'CE', 'B.8', '30'),
    ('30.10', 'Salari e stipendi', 'costo', 'CE', 'B.9.a', '30'),
    ('30.11', 'Oneri sociali', 'costo', 'CE', 'B.9.b', '30'),
    ('30.12', 'Accantonamento TFR', 'costo', 'CE', 'B.9.c', '30'),
    ('30.20', 'Ammortamento immobilizzazioni immateriali', 'costo', 'CE', 'B.10.a', '30'),
    ('30.21', 'Ammortamento immobilizzazioni materiali', 'costo', 'CE', 'B.10.b', '30'),
    ('30.30', 'Variazione delle rimanenze di materiali', 'costo', 'CE', 'B.11', '30'),
    ('30.40', 'Oneri diversi di gestione', 'costo', 'CE', 'B.14', '30'),
    ('40', 'Proventi e oneri finanziari', 'costo', 'CE', 'C', NULL),
    ('40.01', 'Interessi attivi e proventi finanziari', 'ricavo', 'CE', 'C.16', '40'),
    ('40.02', 'Interessi passivi e oneri bancari', 'costo', 'CE', 'C.17', '40'),
    ('50', 'Imposte', 'costo', 'CE', '20', NULL),
    ('50.01', 'Imposte sul reddito dell''esercizio', 'costo', 'CE', '20', '50')
  ), ins AS (
    INSERT INTO public.contabilita_conti (company_id, codice, descrizione, natura, sezione_cee, voce_cee, movimentabile)
    SELECT p_company, codice, descrizione, natura, sezione, voce, mastro IS NOT NULL FROM p
    ON CONFLICT (company_id, codice) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM ins;
  UPDATE public.contabilita_conti c SET mastro_id = m.id
    FROM public.contabilita_conti m
   WHERE c.company_id = p_company AND m.company_id = p_company AND c.mastro_id IS NULL
     AND c.codice LIKE '%.%' AND m.codice = split_part(c.codice, '.', 1);
  RETURN v_n;
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
    WHEN '13.11' THEN 'passivo' WHEN '13.12' THEN 'passivo' WHEN '13.13' THEN 'passivo' WHEN '13.20' THEN 'passivo' WHEN '13.30' THEN 'passivo'
    WHEN '13.90' THEN 'passivo' WHEN '13.02' THEN 'passivo' WHEN '13.01' THEN 'passivo' WHEN '10.03' THEN 'passivo' END;
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
