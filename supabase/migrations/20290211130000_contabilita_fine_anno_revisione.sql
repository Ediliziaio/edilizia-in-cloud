-- Contabilità generale, lotto 3: correzioni dalla revisione (10/11/2026).
--   a. liquidazione IVA: dopo una chiusura il credito sta nell'apertura, non si somma di nuovo;
--   b. l'esercizio non si chiude con IVA ancora da liquidare; l'anteprima dice anche se mancano
--      ammortamenti e TFR;
--   c. all'apertura l'utile dell'anno chiuso va fra gli utili portati a nuovo (10.04);
--   d. dopo la stampa definitiva un documento arrivato tardi si registra il primo giorno libero
--      (resta la sua data come data del documento), invece di non entrare mai;
--   e. i cedolini del mese si riallineano: se cambiano, la scrittura si storna e si rifà;
--   f. con i cedolini servono i debiti verso dipendenti e istituti (13.30, 13.20), niente ripieghi
--      che contano il costo due volte; netto dal cedolino, altre trattenute fra i debiti diversi;
--   g. anteprime con la sola lettura; un cespite dismesso nell'anno si ammortizza anche se non più
--      attivo; la riapertura non storna un'apertura già stampata in definitivo; la liquidazione di un
--      periodo già stampato si registra il primo giorno libero.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Il primo giorno in cui si può registrare: dopo la stampa definitiva, nello stesso esercizio.
CREATE OR REPLACE FUNCTION public.contabilita_data_utile(p_company uuid, p_data date)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN e.stampato_fino_al IS NOT NULL AND p_data <= e.stampato_fino_al
                   AND e.stampato_fino_al < make_date(extract(year FROM p_data)::int, 12, 31)
              THEN e.stampato_fino_al + 1 ELSE p_data END
    FROM (SELECT p_data AS d) x
    LEFT JOIN public.contabilita_esercizi e ON e.company_id = p_company AND e.anno = extract(year FROM p_data)::int;
$$;
REVOKE ALL ON FUNCTION public.contabilita_data_utile(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contabilita_fine_anno(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb; c record; v_quote jsonb := '[]'::jsonb; v_righe jsonb := '[]'::jsonb; v_tot numeric := 0;
  v_aliq numeric; v_piena numeric; v_anni int; v_fondo numeric; v_quota numeric; v_costo_c text; v_fondo_c text;
  v_lordo numeric; v_tfr numeric; v_id_amm uuid; v_id_tfr uuid; v_fatte jsonb := '[]'::jsonb;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  k := public.contabilita_conti_per_ruolo(p_company);
  v_id_amm := md5('ammortamenti:' || p_company || ':' || p_anno)::uuid;
  v_id_tfr := md5('tfr:' || p_company || ':' || p_anno)::uuid;

  FOR c IN
    SELECT * FROM public.cespiti
     WHERE company_id = p_company AND (coalesce(is_active, true) OR extract(year FROM data_dismissione) = p_anno)
       AND data_acquisto IS NOT NULL AND extract(year FROM data_acquisto) <= p_anno
       AND (data_dismissione IS NULL OR extract(year FROM data_dismissione) >= p_anno)
       AND coalesce(costo_storico, 0) > 0
     ORDER BY codice NULLS LAST, descrizione
  LOOP
    v_aliq := coalesce(nullif(c.aliquota_amm, 0), CASE WHEN c.vita_utile_mesi > 0 THEN 1200.0 / c.vita_utile_mesi END);
    IF v_aliq IS NULL THEN CONTINUE; END IF;
    v_piena := round(c.costo_storico * v_aliq / 100, 2);
    v_anni := p_anno - extract(year FROM c.data_acquisto)::int;
    v_fondo := CASE WHEN v_anni <= 0 THEN 0 ELSE least(c.costo_storico, round(v_piena * (v_anni - 0.5), 2)) END;
    v_quota := least(c.costo_storico - v_fondo, CASE WHEN v_anni = 0 THEN round(v_piena / 2, 2) ELSE v_piena END);
    IF v_quota <= 0 THEN CONTINUE; END IF;
    IF lower(coalesce(c.categoria, '')) LIKE 'immater%' THEN
      v_costo_c := '30.20';
      v_fondo_c := CASE WHEN lower(coalesce(c.sottocategoria, '') || ' ' || c.descrizione) ~ '(software|licenz)' THEN '01.01' ELSE '01.02' END;
    ELSE
      v_costo_c := '30.21';
      v_fondo_c := CASE
        WHEN lower(coalesce(c.sottocategoria, '') || ' ' || c.descrizione) ~ '(fabbricat|immobil|capannon|terren)' THEN '02.90'
        WHEN lower(coalesce(c.sottocategoria, '') || ' ' || c.descrizione) ~ '(impiant|macchin|gru|escavat)' THEN '02.91'
        WHEN lower(coalesce(c.sottocategoria, '') || ' ' || c.descrizione) ~ '(attrezz|ponteggi|utensil)' THEN '02.92'
        ELSE '02.93' END;
    END IF;
    v_quote := v_quote || jsonb_build_array(jsonb_build_object('cespite', c.descrizione, 'codice', c.codice, 'costo', c.costo_storico,
      'aliquota', v_aliq, 'fondo_inizio', v_fondo, 'quota', v_quota, 'residuo', c.costo_storico - v_fondo - v_quota,
      'conto_costo', v_costo_c, 'conto_fondo', v_fondo_c));
    v_righe := v_righe
      || public.contabilita_riga(k->>(CASE WHEN k ? v_costo_c THEN v_costo_c ELSE '30.40' END), 'dare', v_quota, c.descrizione)
      || public.contabilita_riga(k->>v_fondo_c, 'avere', v_quota, c.descrizione);
    v_tot := v_tot + v_quota;
  END LOOP;

  SELECT coalesce(sum(lordo), 0) INTO v_lordo FROM public.hr_cedolini
   WHERE company_id = p_company AND anno = p_anno AND stato IN ('emesso', 'pagato');
  v_tfr := round(v_lordo / 13.5, 2);

  IF NOT p_anteprima THEN
    IF v_tot > 0 AND NOT public.contabilita_documento_registrato(p_company, 'ammortamenti', v_id_amm) THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_righe) x WHERE x->>'conto_id' IS NULL) THEN
        RAISE EXCEPTION 'Mancano i conti per costi e fondi di ammortamento (30.20, 30.21, 01.0x, 02.9x): aggiungili al piano dei conti' USING ERRCODE = '22023';
      END IF;
      PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Ammortamenti',
        'Quote di ammortamento ' || p_anno, NULL, NULL, v_righe, 'ammortamenti', v_id_amm, NULL);
      v_fatte := v_fatte || '["ammortamenti"]'::jsonb;
    END IF;
    IF v_tfr > 0 AND NOT public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr) THEN
      IF NOT (k ? '30.12' AND k ? '12.01') THEN
        RAISE EXCEPTION 'Mancano i conti per l''accantonamento TFR (30.12, 12.01)' USING ERRCODE = '22023';
      END IF;
      PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Accantonamento TFR',
        'Quota TFR ' || p_anno || ' sulle retribuzioni dei cedolini', NULL, NULL,
        public.contabilita_riga(k->>'30.12', 'dare', v_tfr, NULL) || public.contabilita_riga(k->>'12.01', 'avere', v_tfr, NULL),
        'tfr', v_id_tfr, NULL);
      v_fatte := v_fatte || '["tfr"]'::jsonb;
    END IF;
  END IF;
  RETURN jsonb_build_object('ammortamenti', v_quote, 'totale_ammortamenti', v_tot,
    'retribuzioni', v_lordo, 'tfr', v_tfr,
    'ammortamenti_registrati', public.contabilita_documento_registrato(p_company, 'ammortamenti', v_id_amm),
    'tfr_registrato', public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr),
    'registrate', v_fatte);
END $$;

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
  v_ricavo_altro text; v_costo_altro text; v_indetraibile numeric; v_banca text; v_contro text; n_mov int := 0; s_giro int := 0; v_cedolini boolean; n_ced int := 0; v_viva public.contabilita_scritture;
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
                      AND pn.entry_date = f.data_pagamento AND abs(pn.amount - f.importo) < 0.01)
  ) ev(tipo, id, data, ordine)
  WHERE p_solo IS NULL OR ev.id = p_solo
  ORDER BY ev.data, ev.ordine, ev.id
  LOOP
    v_origine := CASE e.tipo WHEN 'emessa' THEN 'fattura_emessa' WHEN 'ricevuta' THEN 'fattura_ricevuta' ELSE e.tipo END;
    IF e.tipo <> 'cedolini' AND public.contabilita_documento_registrato(p_company, v_origine, e.id) THEN s_gia := s_gia + 1; CONTINUE; END IF;
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
        tot := CASE WHEN r.document_type = 'credit_note' THEN -r.paid_amount ELSE r.paid_amount END;
        v_righe := public.contabilita_riga(k->>'06.01', 'dare', tot, NULL)
                || public.contabilita_riga(k->>'05.01', 'avere', tot, r.client_company_name);
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data),
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

      ELSIF e.tipo = 'f24' THEN
        SELECT * INTO r FROM public.f24_entries WHERE id = e.id;
        -- Il tributo dice quale debito si chiude: IVA, ritenute, contributi, imposte.
        -- IVA (accantonata dalla liquidazione) e ritenute dei professionisti (accantonate al pagamento)
        -- chiudono il loro debito. Il resto non ha un debito registrato prima: ritenute e addizionali
        -- dei dipendenti sono parte della retribuzione, i contributi sono oneri sociali, IRES e IRAP
        -- imposte dell'esercizio.
        v_conto := CASE
          WHEN r.tributo_code ~ '^60(0[1-9]|1[0-2]|3[1-8]|99)$' OR r.tributo_code IN ('6035', '6040', '6041') THEN '13.11'
          WHEN r.tributo_code IN ('1038', '1040') THEN '13.12'
          WHEN v_cedolini AND (r.tributo_code ~ '^10[0-9]{2}$' OR r.tributo_code ~ '^38(0[1-9]|4[0-9])$') THEN '13.12'
          WHEN v_cedolini AND r.tributo_code ~ '^[A-Z]' THEN '13.20'
          WHEN r.tributo_code ~ '^10[0-9]{2}$' OR r.tributo_code ~ '^38(0[1-9]|4[0-9])$' THEN '30.10'
          WHEN r.tributo_code ~ '^[A-Z]' THEN '30.11'
          WHEN r.tributo_code ~ '^(20|38|17|40)[0-9]{2}$' THEN '50.01'
          ELSE '30.40' END;
        IF NOT k ? v_conto THEN v_conto := CASE WHEN v_conto = '13.12' AND k ? '13.13' THEN '13.13' ELSE '30.40' END; END IF;
        IF NOT k ? v_conto THEN v_conto := '30.01'; END IF;
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
    'saltate_solo_testata', s_testata, 'gia_generate', s_gia, 'errori', s_errori);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_genera_da_documenti(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_genera_da_documenti(uuid, integer, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_chiudi_esercizio(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb; v_utile_conto uuid; v_mastro uuid; v_righe jsonb := '[]'::jsonb; v_aper jsonb := '[]'::jsonb;
  v_utile numeric := 0; x record; v_iva numeric := 0; v_fine jsonb; v_a_nuovo uuid; v_id_chiu uuid; v_id_aper uuid; v_aper_esiste boolean; v_n_ce int := 0; v_n_sp int := 0;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno AND chiuso_il IS NOT NULL) THEN
    RAISE EXCEPTION 'L''esercizio % è già chiuso', p_anno USING ERRCODE = '23505';
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
      'apertura_gia_presente', v_aper_esiste, 'conto_utile', k ? '10.05', 'iva_non_liquidata', v_iva,
      'ammortamenti_da_registrare', (v_fine->>'totale_ammortamenti')::numeric > 0 AND NOT (v_fine->>'ammortamenti_registrati')::boolean,
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

CREATE OR REPLACE FUNCTION public.contabilita_riapri_esercizio(p_company uuid, p_anno integer, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; v_n int := 0;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_motivo, '')) = '' THEN RAISE EXCEPTION 'Serve il motivo della riapertura' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno + 1 AND chiuso_il IS NOT NULL) THEN
    RAISE EXCEPTION 'L''esercizio % è chiuso: riapri prima quello', p_anno + 1 USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno + 1 AND stampato_fino_al IS NOT NULL) THEN
    RAISE EXCEPTION 'Il giornale del % è già stampato in definitivo: la sua apertura non si può più stornare', p_anno + 1 USING ERRCODE = '22023';
  END IF;
  UPDATE public.contabilita_esercizi SET chiuso_il = NULL, chiuso_da = NULL, aggiornato_il = now()
   WHERE company_id = p_company AND anno = p_anno AND chiuso_il IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'L''esercizio % non è chiuso', p_anno USING ERRCODE = '22023'; END IF;
  PERFORM set_config('contabilita.chiusura', 'on', true);
  FOR s IN
    SELECT * FROM public.contabilita_scritture c
     WHERE c.company_id = p_company
       AND ((c.origine = 'chiusura' AND c.origine_id = md5('chiusura:' || p_company || ':' || p_anno)::uuid)
         OR (c.origine = 'apertura' AND c.origine_id = md5('apertura:' || p_company || ':' || (p_anno + 1))::uuid))
       AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = c.id)
  LOOP
    PERFORM public.contabilita_inserisci_scrittura(s.company_id, s.data_registrazione, 'Storno n. ' || s.numero || '/' || s.esercizio,
      'Riapertura dell''esercizio ' || p_anno || ': ' || btrim(p_motivo), NULL, NULL,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id),
      'storno', s.id, s.id);
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('contabilita.chiusura', 'off', true);
  RETURN jsonb_build_object('stornate', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_liquida_iva(p_company uuid, p_dal date, p_al date, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb; v_id uuid; v_vendite numeric; v_acquisti numeric; v_saldo numeric; v_credito_prec numeric := 0;
  v_compensato numeric := 0; v_conto_credito text; v_righe jsonb; v_scrittura uuid;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
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

  -- Dai saldi a fine periodo, liquidazioni comprese: quello che è già stato girato non si gira
  -- due volte (gennaio e poi il trimestre), e un documento registrato dopo la liquidazione del
  -- suo mese entra nella prima liquidazione utile.
  SELECT coalesce(sum(r.avere - r.dare) FILTER (WHERE r.conto_id = (k->>'13.10')::uuid), 0),
         coalesce(sum(r.dare - r.avere) FILTER (WHERE r.conto_id = (k->>'05.10')::uuid), 0)
    INTO v_vendite, v_acquisti
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND s.data_registrazione <= p_al
     AND s.esercizio = extract(year FROM p_al)::int;
  -- Credito delle liquidazioni prima di questa: saldo dare del conto del credito a fine periodo,
  -- senza la liquidazione di questo stesso periodo (anche un trimestre dopo i suoi mesi lo vede).
  SELECT coalesce(sum(r.dare - r.avere), 0) INTO v_credito_prec
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND r.conto_id = (k->>v_conto_credito)::uuid AND s.data_registrazione <= p_al
     AND s.origine_id IS DISTINCT FROM v_id
     -- Dopo una chiusura il credito è già nell'apertura dell'anno: gli anni prima non si sommano di nuovo.
     AND (s.esercizio = extract(year FROM p_al)::int OR NOT EXISTS (
           SELECT 1 FROM public.contabilita_scritture a WHERE a.company_id = p_company AND a.esercizio = extract(year FROM p_al)::int
              AND a.origine = 'apertura' AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = a.id)));
  v_credito_prec := greatest(v_credito_prec, 0);
  v_saldo := v_vendite - v_acquisti;
  IF v_saldo > 0 THEN v_compensato := least(v_credito_prec, v_saldo); END IF;

  IF NOT p_anteprima THEN
    IF public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id) THEN
      RAISE EXCEPTION 'Questo periodo è già liquidato: storna la liquidazione per rifarla' USING ERRCODE = '23505';
    END IF;
    IF v_vendite = 0 AND v_acquisti = 0 THEN RAISE EXCEPTION 'Nessuna IVA da liquidare nel periodo' USING ERRCODE = '22023'; END IF;
    -- Sotto 25,82 euro non si versa: il debito passa al periodo dopo (non si liquida).
    IF v_saldo - v_compensato > 0 AND v_saldo - v_compensato < 25.82 THEN
      RAISE EXCEPTION 'IVA da versare sotto 25,82 €: si somma al periodo successivo' USING ERRCODE = '22023';
    END IF;
    v_righe := public.contabilita_riga(k->>'13.10', 'dare', v_vendite, 'IVA su vendite del periodo')
            || public.contabilita_riga(k->>'05.10', 'avere', v_acquisti, 'IVA su acquisti del periodo')
            || public.contabilita_riga(k->>v_conto_credito, 'avere', v_compensato, 'credito dei periodi precedenti');
    IF v_saldo > 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'13.11', 'avere', v_saldo - v_compensato, 'IVA da versare');
    ELSE
      v_righe := v_righe || public.contabilita_riga(k->>v_conto_credito, 'dare', -v_saldo, 'IVA a credito');
    END IF;
    v_scrittura := public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, p_al), 'Liquidazione IVA',
      'Liquidazione IVA dal ' || to_char(p_dal, 'DD/MM/YYYY') || ' al ' || to_char(p_al, 'DD/MM/YYYY'),
      NULL, NULL, v_righe, 'liquidazione_iva', v_id, NULL);
  END IF;
  RETURN jsonb_build_object('iva_vendite', v_vendite, 'iva_acquisti', v_acquisti, 'saldo', v_saldo,
    'credito_precedente', v_credito_prec, 'compensato', v_compensato,
    'da_versare', greatest(v_saldo - v_compensato, 0),
    'sotto_minimo', v_saldo - v_compensato > 0 AND v_saldo - v_compensato < 25.82, 'a_credito', greatest(-v_saldo, 0),
    'gia_liquidato', public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id),
    'scrittura_id', v_scrittura);
END $$;
