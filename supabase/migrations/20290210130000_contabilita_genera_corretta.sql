-- Contabilità generale: scritture dai documenti, corrette (10/11/2026).
--
-- Il controllo dopo la prima versione ha trovato:
--   1. le fatture emesse dal programma (documenti_fiscali) restavano fuori: si
--      leggevano solo le importate. Ora la fonte è fatture_vendite_iva, la stessa
--      del Registro IVA, e i loro incassi vengono dalla prima nota del documento;
--   2. split payment (esigibilità «S»): il cliente non deve l'IVA, che non si
--      registra fra i debiti;
--   3. bolli e spese fuori imponibile (totale ≠ imponibile + IVA): restavano su
--      clienti e fornitori senza contropartita;
--   4. ritenuta d'acconto dei professionisti: al pagamento il fornitore si chiude
--      per intero, la ritenuta va a Erario c/ritenute (13.12) da versare;
--      ritenuta del 4% dei condomini sulle fatture native: a fattura pagata il
--      residuo del cliente va a crediti verso l'Erario (05.12);
--   5. autofattura TD16 (reverse charge interno): il costo c'è già con la fattura
--      del fornitore, qui solo l'IVA in dare e in avere;
--   6. i documenti si registrano in ordine di data, tutti insieme, così i numeri
--      seguono il calendario;
--   7. una scrittura stornata si può rigenerare (prima l'indice unico lo
--      impediva), e si può ri-registrare un documento solo (conto di costo
--      cambiato: contabilita_riregistra_documento);
--   8. una registrazione in un mese fiscale chiuso viene rifiutata.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DROP INDEX IF EXISTS public.contabilita_scritture_origine_unica;
CREATE INDEX IF NOT EXISTS contabilita_scritture_origine_idx
  ON public.contabilita_scritture(company_id, origine, origine_id) WHERE origine_id IS NOT NULL;

-- ─── Il mese fiscale chiuso non si tocca ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contabilita_periodo_chiuso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fiscalita_periodi
              WHERE company_id = NEW.company_id AND mese = date_trunc('month', NEW.data_registrazione)::date AND stato = 'chiuso') THEN
    RAISE EXCEPTION 'Il mese di % è chiuso: riaprilo prima di registrare', to_char(NEW.data_registrazione, 'MM/YYYY') USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_periodo_chiuso() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS contabilita_scritture_periodo_chiuso ON public.contabilita_scritture;
CREATE TRIGGER contabilita_scritture_periodo_chiuso BEFORE INSERT ON public.contabilita_scritture
  FOR EACH ROW EXECUTE FUNCTION public.contabilita_periodo_chiuso();

-- ─── Una scrittura «viva» per un documento: c'è e non è stata stornata ───────
CREATE OR REPLACE FUNCTION public.contabilita_documento_registrato(p_company uuid, p_origine text, p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contabilita_scritture s
     WHERE s.company_id = p_company AND s.origine = p_origine AND s.origine_id = p_id
       AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id));
$$;
REVOKE ALL ON FUNCTION public.contabilita_documento_registrato(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_documento_registrato(uuid, text, uuid) TO authenticated, service_role;

-- Una riga del giornale da un importo con segno: negativo = lato opposto, zero = nessuna riga.
CREATE OR REPLACE FUNCTION public.contabilita_riga(p_conto text, p_lato text, p_importo numeric, p_descrizione text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN coalesce(round(p_importo, 2), 0) = 0 THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('conto_id', p_conto,
      CASE WHEN (p_importo > 0) = (p_lato = 'dare') THEN 'dare' ELSE 'avere' END, abs(round(p_importo, 2)),
      'descrizione', p_descrizione))) END;
$$;
REVOKE ALL ON FUNCTION public.contabilita_riga(text, text, numeric, text) FROM PUBLIC, anon;

DROP FUNCTION IF EXISTS public.contabilita_genera_da_documenti(uuid, integer);

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
  v_ricavo_altro text; v_costo_altro text;
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
  SELECT 'ritenuta_subita', d.id, coalesce(d.pagato_at::date, d.data_emissione), 4 FROM public.documenti_fiscali d
   WHERE d.company_id = p_company AND d.deleted_at IS NULL AND d.stato = 'pagata' AND coalesce(d.ritenuta_importo, 0) > 0
     AND coalesce(d.pagato_at::date, d.data_emissione) BETWEEN v_dal AND v_al
  UNION ALL
  SELECT 'pagamento', f.id, f.pagata_il, 4 FROM public.fatture_ricevute f
   WHERE f.company_id = p_company AND f.pagata_il BETWEEN v_dal AND v_al AND f.stato <> 'rifiutata'
     AND f.tipo_documento NOT IN ('TD04', 'TD08', 'TD16', 'TD17', 'TD18', 'TD19')
     AND coalesce(f.totale_documento, 0) > 0
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
          v_righe := public.contabilita_riga(k->>v_conto, 'dare', imp, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>'05.10', 'dare', iva, NULL);
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
        SELECT p.amount, p.payment_date, p.invoice_id, i.invoice_number, i.client_company_name INTO r
          FROM public.invoice_payments p JOIN public.invoices i ON i.id = p.invoice_id WHERE p.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', r.invoice_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        v_righe := jsonb_build_array(
          jsonb_build_object('conto_id', k->>'06.01', CASE WHEN r.amount > 0 THEN 'dare' ELSE 'avere' END, abs(r.amount)),
          jsonb_build_object('conto_id', k->>'05.01', CASE WHEN r.amount > 0 THEN 'avere' ELSE 'dare' END, abs(r.amount), 'descrizione', r.client_company_name));
        PERFORM public.contabilita_inserisci_scrittura(p_company, r.payment_date, 'Incasso fattura', r.client_company_name,
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
        SELECT f.totale_documento, f.netto_a_pagare, f.ritenuta_importo, f.trattenuta_garanzia, f.numero_fattura, f.cedente_ragione_sociale INTO r
          FROM public.fatture_ricevute f WHERE f.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_ricevuta', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        rit := coalesce(r.ritenuta_importo, 0);
        netto := coalesce(r.netto_a_pagare, r.totale_documento - rit - coalesce(r.trattenuta_garanzia, 0));
        IF netto <= 0 AND rit <= 0 THEN CONTINUE; END IF;
        IF rit > 0 AND NOT k ? '13.12' THEN RAISE EXCEPTION 'manca il conto delle ritenute da versare (ruolo 13.12)'; END IF;
        v_righe := jsonb_build_array(jsonb_build_object('conto_id', k->>'13.04', 'dare', netto + rit, 'descrizione', r.cedente_ragione_sociale));
        IF netto > 0 THEN v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'06.01', 'avere', netto)); END IF;
        IF rit > 0 THEN v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'13.12', 'avere', rit, 'descrizione', 'ritenuta d''acconto da versare')); END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, e.data, 'Pagamento fornitore', r.cedente_ragione_sociale,
          r.numero_fattura, NULL, v_righe, v_origine, e.id, NULL);
        n_pag := n_pag + 1;
      END IF;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('%s %s del %s: %s', e.tipo, e.id, to_char(e.data, 'DD/MM/YYYY'), SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'fatture_emesse', n_em, 'fatture_ricevute', n_ric, 'incassi', n_inc, 'pagamenti', n_pag, 'altre', n_alt,
    'saltate_solo_testata', s_testata, 'gia_generate', s_gia, 'errori', s_errori);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_genera_da_documenti(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_genera_da_documenti(uuid, integer, uuid) TO authenticated, service_role;

-- ─── Ri-registrare un documento (conto di costo cambiato, dati corretti) ─────
-- Storna le sue scritture ancora vive e lo registra di nuovo con i dati di adesso.
CREATE OR REPLACE FUNCTION public.contabilita_riregistra_documento(p_company uuid, p_documento uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; v_anno int; v_stornate int := 0;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  FOR s IN
    SELECT * FROM public.contabilita_scritture c
     WHERE c.company_id = p_company AND c.origine_id = p_documento AND c.origine IN ('fattura_emessa', 'fattura_ricevuta')
       AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = c.id)
  LOOP
    v_anno := s.esercizio;
    PERFORM public.contabilita_inserisci_scrittura(s.company_id, current_date, 'Storno n. ' || s.numero || '/' || s.esercizio,
      coalesce(nullif(btrim(p_motivo), ''), 'Documento registrato di nuovo'), s.documento_numero, s.documento_data,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id),
      'storno', s.id, s.id);
    v_stornate := v_stornate + 1;
  END LOOP;
  IF v_anno IS NULL THEN
    RETURN jsonb_build_object('stornate', 0, 'registrata', false);
  END IF;
  RETURN jsonb_build_object('stornate', v_stornate, 'esito', public.contabilita_genera_da_documenti(p_company, v_anno, p_documento));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_riregistra_documento(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_riregistra_documento(uuid, uuid, text) TO authenticated, service_role;
