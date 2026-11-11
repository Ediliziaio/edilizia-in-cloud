-- Contabilità generale, lotto 1 delle correzioni dalla revisione dell'11/11/2026.
--
-- 1. Rimanenze iniziali doppie dopo la chiusura dell'anno prima: contabilita_saldo_senza_rimanenze
--    sommava tutti gli anni, apertura compresa. Con l'apertura dell'anno si legge solo quell'anno.
-- 2. Gli esercizi si chiudono in ordine: non si chiude un anno con uno precedente ancora aperto, né
--    con l'anno dopo già chiuso. L'anteprima lo dice (esercizio_precedente_aperto).
-- 3. Incassi a rate delle fatture senza registro pagamenti: si registrava solo il primo. Ora a ogni
--    giro si registra la differenza fra l'incassato di oggi e quello già nel giornale, anche negativa.
-- 4. Una registrazione alla volta per azienda: rimanenze, ratei, ammortamenti, TFR, cessioni, storni,
--    riapertura e ri-registrazione prendono lo stesso lock della generazione automatica.
-- Le funzioni sono riprese intere dalla definizione in produzione, cambiate solo nei punti detti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.contabilita_saldo_senza_rimanenze(p_company uuid, p_conto uuid, p_anno integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT coalesce(sum(r.dare - r.avere), 0)
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND r.conto_id = p_conto
     -- Con l'apertura dell'anno i saldi di prima sono già dentro: contarli di nuovo raddoppia le
     -- rimanenze. Senza apertura (anno prima mai chiuso qui) si sommano gli anni precedenti.
     AND CASE WHEN EXISTS (SELECT 1 FROM public.contabilita_scritture a
                            WHERE a.company_id = p_company AND a.esercizio = p_anno AND a.origine = 'apertura'
                              AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = a.id))
              THEN s.esercizio = p_anno
              ELSE s.data_registrazione <= make_date(p_anno, 12, 31) END
     AND NOT (s.origine = 'rimanenze' AND s.esercizio = p_anno)
     AND NOT (s.origine = 'storno' AND EXISTS (
       SELECT 1 FROM public.contabilita_scritture o WHERE o.id = s.storno_di AND o.origine = 'rimanenze' AND o.esercizio = p_anno));
$$;

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
      'apertura_gia_presente', v_aper_esiste, 'conto_utile', k ? '10.05', 'iva_non_liquidata', v_iva,
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
                      AND pn.entry_date = f.data_pagamento AND abs(pn.amount - f.importo) < 0.01)
  ) ev(tipo, id, data, ordine)
  WHERE p_solo IS NULL OR ev.id = p_solo
  ORDER BY ev.data, ev.ordine, ev.id
  LOOP
    v_origine := CASE e.tipo WHEN 'emessa' THEN 'fattura_emessa' WHEN 'ricevuta' THEN 'fattura_ricevuta' ELSE e.tipo END;
    IF e.tipo NOT IN ('cedolini', 'incasso_fattura') AND public.contabilita_documento_registrato(p_company, v_origine, e.id) THEN s_gia := s_gia + 1; CONTINUE; END IF;
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
          CASE WHEN tot < 0 AND r.document_type = 'credit_note' THEN 'Rimborso nota di credito'
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

CREATE OR REPLACE FUNCTION public.contabilita_rimanenze(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true, p_lavori numeric DEFAULT NULL::numeric, p_materiali numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('rimanenze:' || p_company || ':' || p_anno)::uuid;
  v_ini_lav numeric := 0; v_ini_mat numeric := 0; v_fin_lav numeric; v_fin_mat numeric;
  v_prop_lav numeric; v_prop_mat numeric; v_righe jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_vecchia record; v_registrata boolean; v_da_aggiornare boolean := false;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0)); END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_lavori, 0) < 0 OR coalesce(p_materiali, 0) < 0 THEN RAISE EXCEPTION 'Le rimanenze non sono negative' USING ERRCODE = '22023'; END IF;

  -- Proposte: lavori in corso dalle commesse (maturato − fatturato), materiali dalla giacenza × costo medio.
  SELECT round(coalesce(sum(lavori_in_corso), 0), 2) INTO v_prop_lav FROM public.v_cg_lavori_in_corso WHERE company_id = p_company;
  SELECT round(coalesce(sum(greatest(quantity, 0) * coalesce(unit_cost, 0)), 0), 2) INTO v_prop_mat
    FROM public.warehouse_stock WHERE company_id = p_company;

  IF NOT p_anteprima THEN
    IF p_lavori IS NOT NULL THEN
      INSERT INTO public.cg_rimanenze_lavori (company_id, esercizio, importo, fonte, created_by)
      VALUES (p_company, p_anno, round(p_lavori, 2), CASE WHEN round(p_lavori, 2) = v_prop_lav THEN 'calcolata' ELSE 'manuale' END, auth.uid())
      ON CONFLICT (company_id, esercizio) DO UPDATE SET importo = EXCLUDED.importo, fonte = EXCLUDED.fonte, updated_at = now();
    END IF;
    IF p_materiali IS NOT NULL THEN
      INSERT INTO public.cg_rimanenze_magazzino (company_id, esercizio, importo, fonte, created_by)
      VALUES (p_company, p_anno, round(p_materiali, 2), CASE WHEN round(p_materiali, 2) = v_prop_mat THEN 'calcolata' ELSE 'manuale' END, auth.uid())
      ON CONFLICT (company_id, esercizio) DO UPDATE SET importo = EXCLUDED.importo, fonte = EXCLUDED.fonte, updated_at = now();
    END IF;
  END IF;
  SELECT importo INTO v_fin_lav FROM public.cg_rimanenze_lavori WHERE company_id = p_company AND esercizio = p_anno;
  SELECT importo INTO v_fin_mat FROM public.cg_rimanenze_magazzino WHERE company_id = p_company AND esercizio = p_anno;

  IF k ? '04.02' THEN v_ini_lav := public.contabilita_saldo_senza_rimanenze(p_company, (k->>'04.02')::uuid, p_anno); END IF;
  IF k ? '04.01' THEN v_ini_mat := public.contabilita_saldo_senza_rimanenze(p_company, (k->>'04.01')::uuid, p_anno); END IF;

  -- Conti che servono: solo per quello che c'è (un'azienda senza magazzino non sceglie i conti dei materiali).
  IF v_ini_lav <> 0 OR coalesce(v_fin_lav, 0) <> 0 OR v_prop_lav <> 0 THEN
    IF NOT k ? '04.02' THEN v_mancano := array_append(v_mancano, '04.02'); END IF;
    IF NOT k ? '20.03' THEN v_mancano := array_append(v_mancano, '20.03'); END IF;
  END IF;
  IF v_ini_mat <> 0 OR coalesce(v_fin_mat, 0) <> 0 OR v_prop_mat <> 0 THEN
    IF NOT k ? '04.01' THEN v_mancano := array_append(v_mancano, '04.01'); END IF;
    IF NOT k ? '30.30' THEN v_mancano := array_append(v_mancano, '30.30'); END IF;
  END IF;

  -- Chiude le iniziali, apre le finali, sulla variazione. Senza i conti non si scrive niente.
  IF cardinality(v_mancano) = 0 THEN
    IF v_ini_lav <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'20.03', 'dare', v_ini_lav, 'Rimanenze iniziali lavori in corso')
                         || public.contabilita_riga(k->>'04.02', 'avere', v_ini_lav, 'Rimanenze iniziali lavori in corso');
    END IF;
    IF coalesce(v_fin_lav, 0) <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'04.02', 'dare', v_fin_lav, 'Rimanenze finali lavori in corso')
                         || public.contabilita_riga(k->>'20.03', 'avere', v_fin_lav, 'Rimanenze finali lavori in corso');
    END IF;
    IF v_ini_mat <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'30.30', 'dare', v_ini_mat, 'Rimanenze iniziali materiali')
                         || public.contabilita_riga(k->>'04.01', 'avere', v_ini_mat, 'Rimanenze iniziali materiali');
    END IF;
    IF coalesce(v_fin_mat, 0) <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'04.01', 'dare', v_fin_mat, 'Rimanenze finali materiali')
                         || public.contabilita_riga(k->>'30.30', 'avere', v_fin_mat, 'Rimanenze finali materiali');
    END IF;
  END IF;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'rimanenze' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrata := v_vecchia.id IS NOT NULL;
  -- Registrata, ma i valori di oggi (CdG, anno prima) non sono più quelli: va rifatta.
  v_da_aggiornare := v_registrata AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno, nel riquadro dei conti da usare)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrata OR v_da_aggiornare THEN
      IF v_registrata THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Rimanenze cambiate', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id),
          'storno', v_vecchia.id, v_vecchia.id);
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Rimanenze',
          'Rimanenze iniziali e finali ' || p_anno, NULL, NULL, v_righe, 'rimanenze', v_id, NULL);
      END IF;
      v_registrata := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lavori', jsonb_build_object('iniziali', v_ini_lav, 'finali', v_fin_lav, 'proposta', v_prop_lav),
    'materiali', jsonb_build_object('iniziali', v_ini_mat, 'finali', v_fin_mat, 'proposta', v_prop_mat),
    'registrata', v_registrata,
    'da_aggiornare', v_da_aggiornare,
    'conti_mancanti', to_jsonb(v_mancano));
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_ratei_risconti_registra(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  v_id_storno uuid := md5('riapertura_ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  x record; v_q numeric; v_righe jsonb := '[]'::jsonb; v_elenco jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_ruolo text; v_vecchia record; v_vecchia_ap record; v_registrata boolean; v_da_aggiornare boolean := false; v_tot numeric := 0;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0)); END IF;
  FOR x IN SELECT r.*, c.codice, c.descrizione AS conto_descrizione FROM public.contabilita_ratei_risconti r
             JOIN public.contabilita_conti c ON c.id = r.conto_id
            WHERE r.company_id = p_company AND r.esercizio = p_anno ORDER BY r.tipo, r.created_at LOOP
    v_q := public.contabilita_quota_rateo_risconto(x.tipo, x.importo, x.dal, x.al, p_anno);
    v_ruolo := CASE x.tipo WHEN 'risconto_attivo' THEN '07.02' WHEN 'rateo_attivo' THEN '07.01' WHEN 'risconto_passivo' THEN '14.02' ELSE '14.01' END;
    IF NOT k ? v_ruolo AND NOT v_ruolo = ANY (v_mancano) THEN v_mancano := array_append(v_mancano, v_ruolo); END IF;
    v_elenco := v_elenco || jsonb_build_array(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'descrizione', x.descrizione,
      'conto', x.codice || ' ' || x.conto_descrizione, 'importo', x.importo, 'dal', x.dal, 'al', x.al, 'quota', v_q));
    -- Senza il conto del ruolo la riga non si scrive: l'anteprima lo segnala, la registrazione si ferma.
    IF v_q > 0 AND k ? v_ruolo THEN
      v_tot := v_tot + v_q;
      -- Attivi: in dare il conto di rateo/risconto; passivi: in avere. Il costo/ricavo dall'altra parte.
      IF x.tipo IN ('risconto_attivo', 'rateo_attivo') THEN
        v_righe := v_righe || public.contabilita_riga(k->>v_ruolo, 'dare', v_q, x.descrizione) || public.contabilita_riga(x.conto_id::text, 'avere', v_q, x.descrizione);
      ELSE
        v_righe := v_righe || public.contabilita_riga(x.conto_id::text, 'dare', v_q, x.descrizione) || public.contabilita_riga(k->>v_ruolo, 'avere', v_q, x.descrizione);
      END IF;
    END IF;
  END LOOP;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'ratei_risconti' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrata := v_vecchia.id IS NOT NULL;
  -- Registrati, ma l'elenco di oggi non è più quello: vanno rifatti.
  v_da_aggiornare := v_registrata AND cardinality(v_mancano) = 0 AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno, nel riquadro dei conti da usare)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrata OR v_da_aggiornare THEN
      -- Via le due di prima (31/12 e la sua riapertura all'01/01), poi le nuove.
      IF v_registrata THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, v_vecchia.data_registrazione, 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Ratei e risconti cambiati', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id), 'storno', v_vecchia.id, v_vecchia.id);
        SELECT * INTO v_vecchia_ap FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = 'riapertura_ratei_risconti' AND s.origine_id = v_id_storno
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_vecchia_ap.id IS NOT NULL THEN
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_vecchia_ap.data_registrazione), 'Storno n. ' || v_vecchia_ap.numero || '/' || v_vecchia_ap.esercizio,
            'Ratei e risconti cambiati', NULL, NULL,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_vecchia_ap.id), 'storno', v_vecchia_ap.id, v_vecchia_ap.id);
        END IF;
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Ratei e risconti',
          'Ratei e risconti al 31/12/' || p_anno, NULL, NULL, v_righe, 'ratei_risconti', v_id, NULL);
        -- All'01/01 dell'anno dopo la stessa scrittura al contrario: la competenza torna sui costi e ricavi.
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, make_date(p_anno + 1, 1, 1)), 'Riapertura ratei e risconti',
          'Storno dei ratei e risconti del ' || p_anno, NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', y->>'conto_id', 'dare', coalesce((y->>'avere')::numeric, 0), 'avere', coalesce((y->>'dare')::numeric, 0), 'descrizione', y->>'descrizione'))
             FROM jsonb_array_elements(v_righe) y),
          'riapertura_ratei_risconti', v_id_storno, NULL);
      END IF;
      v_registrata := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;
  RETURN jsonb_build_object('voci', v_elenco, 'totale', v_tot, 'registrata', v_registrata, 'da_aggiornare', v_da_aggiornare, 'conti_mancanti', to_jsonb(v_mancano));
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_ammortamenti(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('ammortamenti:' || p_company || ':' || p_anno)::uuid;
  c public.cespiti; v_conti jsonb; v_f jsonb; v_q numeric; v_quote jsonb := '[]'::jsonb; v_righe jsonb := '[]'::jsonb;
  v_tot numeric := 0; v_mancano text[] := '{}'; v_vecchia record; v_registrati boolean; v_da_aggiornare boolean := false;
  v_per_cespite jsonb := '[]'::jsonb; x text;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0)); END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;

  FOR c IN
    SELECT * FROM public.cespiti ce
     WHERE ce.company_id = p_company AND ce.data_acquisto IS NOT NULL AND extract(year FROM ce.data_acquisto) <= p_anno
       AND coalesce(ce.costo_storico, 0) > 0
       -- Dismesso prima dell'anno: niente. Ceduto nell'anno in contabilità: la quota sta nella cessione.
       AND (ce.data_dismissione IS NULL OR extract(year FROM ce.data_dismissione) >= p_anno)
       AND NOT (coalesce(extract(year FROM ce.data_dismissione) = p_anno, false) AND public.contabilita_documento_registrato(p_company, 'cessione_cespite', ce.id))
     ORDER BY ce.codice NULLS LAST, ce.descrizione, ce.id
  LOOP
    IF public.contabilita_cespite_aliquota(c) IS NULL THEN CONTINUE; END IF;
    v_f := public.contabilita_cespite_fondo(c, p_anno);
    v_q := public.contabilita_cespite_quota(c, p_anno, (v_f->>'fondo')::numeric);
    v_conti := public.contabilita_cespite_conti(c, k);
    v_quote := v_quote || jsonb_build_array(jsonb_build_object('id', c.id, 'cespite', c.descrizione, 'codice', c.codice,
      'categoria', c.categoria, 'costo', c.costo_storico, 'aliquota', public.contabilita_cespite_aliquota(c),
      'fondo_inizio', (v_f->>'fondo')::numeric, 'fondo_stimato', (v_f->>'stimato')::boolean, 'quota', v_q,
      'residuo', c.costo_storico - (v_f->>'fondo')::numeric - v_q,
      'conto_bene', v_conti->>'bene', 'conto_fondo', v_conti->>'fondo', 'conto_ammortamento', v_conti->>'ammortamento',
      'ruoli', v_conti->'ruoli'));
    IF v_q <= 0 THEN CONTINUE; END IF;
    FOR x IN SELECT jsonb_array_elements_text(v_conti->'mancanti') LOOP
      IF NOT x = ANY (v_mancano) AND x IN (v_conti->'ruoli'->>'fondo', v_conti->'ruoli'->>'ammortamento') THEN
        v_mancano := array_append(v_mancano, x);
      END IF;
    END LOOP;
    IF v_conti->>'fondo' IS NOT NULL AND v_conti->>'ammortamento' IS NOT NULL THEN
      v_righe := v_righe || public.contabilita_riga(v_conti->>'ammortamento', 'dare', v_q, c.descrizione)
                         || public.contabilita_riga(v_conti->>'fondo', 'avere', v_q, c.descrizione);
      v_per_cespite := v_per_cespite || jsonb_build_array(jsonb_build_object('id', c.id, 'quota', v_q));
    END IF;
    v_tot := v_tot + v_q;
  END LOOP;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'ammortamenti' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrati := v_vecchia.id IS NOT NULL;
  v_da_aggiornare := v_registrati AND cardinality(v_mancano) = 0 AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo nel registro dei cespiti o in Fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrati OR v_da_aggiornare THEN
      IF v_registrati THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_vecchia.data_registrazione), 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Ammortamenti cambiati', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id), 'storno', v_vecchia.id, v_vecchia.id);
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Ammortamenti',
          'Quote di ammortamento ' || p_anno, NULL, NULL, v_righe, 'ammortamenti', v_id, NULL);
      END IF;
      -- Il registro segue il giornale: le quote dell'anno sono quelle appena scritte.
      DELETE FROM public.contabilita_cespiti_quote WHERE company_id = p_company AND esercizio = p_anno AND origine = 'ammortamenti';
      INSERT INTO public.contabilita_cespiti_quote (cespite_id, company_id, esercizio, quota, origine)
      SELECT (y->>'id')::uuid, p_company, p_anno, (y->>'quota')::numeric, 'ammortamenti' FROM jsonb_array_elements(v_per_cespite) y;
      v_registrati := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;
  RETURN jsonb_build_object('quote', v_quote, 'totale', v_tot, 'registrati', v_registrati,
    'da_aggiornare', v_da_aggiornare, 'conti_mancanti', to_jsonb(v_mancano));
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_fine_anno(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb; v_amm jsonb; v_lordo numeric; v_tfr numeric; v_id_tfr uuid; v_fatte jsonb := '[]'::jsonb; v_prima boolean;
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

  IF NOT p_anteprima AND v_tfr > 0 AND NOT public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr) THEN
    IF NOT (k ? '30.12' AND k ? '12.01') THEN
      RAISE EXCEPTION 'Mancano i conti per l''accantonamento TFR (30.12, 12.01)' USING ERRCODE = '22023';
    END IF;
    PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Accantonamento TFR',
      'Quota TFR ' || p_anno || ' sulle retribuzioni dei cedolini', NULL, NULL,
      public.contabilita_riga(k->>'30.12', 'dare', v_tfr, NULL) || public.contabilita_riga(k->>'12.01', 'avere', v_tfr, NULL),
      'tfr', v_id_tfr, NULL);
    v_fatte := v_fatte || '["tfr"]'::jsonb;
  END IF;
  v_prima := (v_amm->>'registrati')::boolean;
  RETURN jsonb_build_object('ammortamenti', v_amm->'quote', 'totale_ammortamenti', (v_amm->>'totale')::numeric,
    'retribuzioni', v_lordo, 'tfr', v_tfr,
    -- «Registrati» solo se il giornale è ancora quello giusto: un registro cambiato chiede di rifarli.
    'ammortamenti_registrati', v_prima AND NOT (v_amm->>'da_aggiornare')::boolean,
    'ammortamenti_da_aggiornare', (v_amm->>'da_aggiornare')::boolean,
    'conti_mancanti_ammortamenti', v_amm->'conti_mancanti',
    'tfr_registrato', public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr),
    'registrate', v_fatte);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_cespite_cessione(p_cespite uuid, p_data date, p_prezzo numeric, p_conto_prezzo uuid DEFAULT NULL::uuid, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  c public.cespiti; k jsonb; v_anno int; v_f jsonb; v_fondo numeric; v_q numeric; v_residuo numeric; v_diff numeric;
  v_conti jsonb; v_righe jsonb; v_mancano text[] := '{}'; v_desc text; v_amm_reg boolean; v_data date;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(c.company_id) ELSE public.contabilita_puo_scrivere(c.company_id) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || c.company_id, 0)); END IF;
  IF p_data IS NULL OR p_data < c.data_acquisto THEN RAISE EXCEPTION 'La data di cessione non può precedere l''acquisto' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_prezzo, -1) < 0 THEN RAISE EXCEPTION 'Il prezzo di cessione non è negativo (zero per una rottamazione)' USING ERRCODE = '22023'; END IF;
  IF public.contabilita_documento_registrato(c.company_id, 'cessione_cespite', c.id) THEN
    RAISE EXCEPTION 'La cessione di questo cespite è già registrata: annullala prima di rifarla' USING ERRCODE = '22023';
  END IF;
  k := public.contabilita_conti_per_ruolo(c.company_id);
  v_anno := extract(year FROM p_data)::int;
  v_f := public.contabilita_cespite_fondo(c, v_anno);
  v_fondo := (v_f->>'fondo')::numeric;
  v_q := public.contabilita_cespite_quota(c, v_anno, v_fondo, p_data);
  v_residuo := c.costo_storico - v_fondo - v_q;
  v_diff := round(p_prezzo - v_residuo, 2);
  v_conti := public.contabilita_cespite_conti(c, k);
  SELECT array_agg(x) INTO v_mancano FROM jsonb_array_elements_text(v_conti->'mancanti') x;
  v_mancano := coalesce(v_mancano, '{}');
  IF v_diff > 0 AND NOT k ? '20.04' THEN v_mancano := array_append(v_mancano, '20.04'); END IF;
  IF v_diff < 0 AND NOT k ? '30.40' THEN v_mancano := array_append(v_mancano, '30.40'); END IF;
  v_amm_reg := public.contabilita_documento_registrato(c.company_id, 'ammortamenti', md5('ammortamenti:' || c.company_id || ':' || v_anno)::uuid);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo nel registro dei cespiti o in Fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF p_prezzo > 0 AND (p_conto_prezzo IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.contabilita_conti WHERE id = p_conto_prezzo AND company_id = c.company_id AND movimentabile AND attivo)) THEN
      RAISE EXCEPTION 'Indica su quale conto sta il prezzo di vendita' USING ERRCODE = '22023';
    END IF;
    v_desc := 'Cessione ' || c.descrizione;
    v_righe := public.contabilita_riga(v_conti->>'ammortamento', 'dare', v_q, 'Quota ' || v_anno || ' fino alla cessione')
            || public.contabilita_riga(v_conti->>'fondo', 'avere', v_q, 'Quota ' || v_anno || ' fino alla cessione')
            || public.contabilita_riga(v_conti->>'fondo', 'dare', v_fondo + v_q, 'Chiusura del fondo')
            || public.contabilita_riga(v_conti->>'bene', 'avere', c.costo_storico, 'Uscita del bene')
            || public.contabilita_riga(p_conto_prezzo::text, 'dare', p_prezzo, 'Prezzo di cessione')
            || CASE WHEN v_diff > 0 THEN public.contabilita_riga(k->>'20.04', 'avere', v_diff, 'Plusvalenza')
                    ELSE public.contabilita_riga(k->>'30.40', 'dare', -v_diff, 'Minusvalenza') END;
    -- Giornale già stampato fino a quella data: si registra il primo giorno libero, con la data della cessione nel documento.
    v_data := public.contabilita_data_utile(c.company_id, p_data);
    PERFORM public.contabilita_inserisci_scrittura(c.company_id, v_data, 'Cessione cespite', v_desc, NULL, p_data,
      v_righe, 'cessione_cespite', c.id, NULL);
    UPDATE public.cespiti SET data_dismissione = p_data, is_active = false, prezzo_cessione = p_prezzo,
           prima_della_cessione = jsonb_build_object('fondo_amm', fondo_amm, 'data_dismissione', data_dismissione, 'is_active', is_active),
           fondo_amm = least(costo_storico, v_fondo + v_q), updated_at = now()
     WHERE id = c.id;
    INSERT INTO public.contabilita_cespiti_quote (cespite_id, company_id, esercizio, quota, origine)
    VALUES (c.id, c.company_id, v_anno, v_q, 'cessione')
    ON CONFLICT (cespite_id, esercizio) DO UPDATE SET quota = EXCLUDED.quota, origine = EXCLUDED.origine, created_at = now();
    -- Ammortamenti dell'anno già registrati: si rifanno senza questo cespite, che ha la quota nella cessione.
    IF v_amm_reg THEN PERFORM public.contabilita_ammortamenti(c.company_id, v_anno, false); END IF;
  END IF;
  RETURN jsonb_build_object('fondo_inizio', v_fondo, 'fondo_stimato', (v_f->>'stimato')::boolean, 'quota', v_q,
    'residuo', v_residuo, 'prezzo', p_prezzo, 'plusvalenza', greatest(v_diff, 0), 'minusvalenza', greatest(-v_diff, 0),
    'conti_mancanti', to_jsonb(v_mancano), 'registrata', NOT p_anteprima);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_cespite_annulla_cessione(p_cespite uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE c public.cespiti; s record; v_anno int;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(c.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || c.company_id, 0));
  SELECT * INTO s FROM public.contabilita_scritture x
   WHERE x.company_id = c.company_id AND x.origine = 'cessione_cespite' AND x.origine_id = c.id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = x.id)
   ORDER BY x.created_at DESC LIMIT 1;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Nessuna cessione registrata per questo cespite' USING ERRCODE = '22023'; END IF;
  v_anno := extract(year FROM s.data_registrazione)::int;
  PERFORM public.contabilita_inserisci_scrittura(c.company_id, public.contabilita_data_utile(c.company_id, s.data_registrazione), 'Storno n. ' || s.numero || '/' || s.esercizio,
    'Cessione annullata', NULL, NULL,
    (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
       FROM public.contabilita_righe WHERE scrittura_id = s.id), 'storno', s.id, s.id);
  DELETE FROM public.contabilita_cespiti_quote WHERE cespite_id = c.id AND esercizio = v_anno AND origine = 'cessione';
  -- Il cespite torna com'era prima della cessione, anche nel Controllo di gestione.
  UPDATE public.cespiti SET
         data_dismissione = CASE WHEN prima_della_cessione ? 'data_dismissione' THEN (prima_della_cessione->>'data_dismissione')::date END,
         is_active = coalesce((prima_della_cessione->>'is_active')::boolean, true),
         fondo_amm = coalesce((prima_della_cessione->>'fondo_amm')::numeric, fondo_amm),
         prezzo_cessione = NULL, prima_della_cessione = NULL, updated_at = now()
   WHERE id = c.id;
  IF public.contabilita_documento_registrato(c.company_id, 'ammortamenti', md5('ammortamenti:' || c.company_id || ':' || v_anno)::uuid) THEN
    PERFORM public.contabilita_ammortamenti(c.company_id, v_anno, false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_cespite_da_fattura(p_fattura uuid, p_linea text, p_descrizione text, p_categoria text, p_sottocategoria text, p_aliquota numeric, p_conto_bene uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  f record; r jsonb; v_costo numeric; v_id uuid; k jsonb; v_ruoli jsonb; v_conto uuid; s record;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(f.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || f.company_id, 0));
  IF f.tipo_documento IN ('TD04', 'TD08') THEN RAISE EXCEPTION 'Una nota di credito non diventa un cespite' USING ERRCODE = '22023'; END IF;
  IF p_categoria NOT IN ('materiale', 'immateriale') THEN RAISE EXCEPTION 'Categoria: materiale o immateriale' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_aliquota, 0) <= 0 OR p_aliquota > 100 THEN RAISE EXCEPTION 'Aliquota di ammortamento fra 0 e 100' USING ERRCODE = '22023'; END IF;
  SELECT x INTO r FROM jsonb_array_elements(coalesce(f.righe, '[]'::jsonb)) WITH ORDINALITY t(x, n)
   WHERE coalesce(nullif(x->>'numero_linea', ''), n::text) = p_linea LIMIT 1;
  IF r IS NULL THEN RAISE EXCEPTION 'Riga % non trovata nella fattura', p_linea USING ERRCODE = '22023'; END IF;
  v_costo := round(coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0)
    * (1 + coalesce(nullif(r->>'aliquota_iva', '')::numeric, 0) / 100 * (1 - coalesce(f.detraibilita_percentuale, 100) / 100.0)), 2);
  IF v_costo <= 0 THEN RAISE EXCEPTION 'La riga non ha un importo positivo' USING ERRCODE = '22023'; END IF;

  k := public.contabilita_conti_per_ruolo(f.company_id);
  v_ruoli := public.contabilita_cespite_ruoli(p_categoria, p_sottocategoria, coalesce(nullif(btrim(p_descrizione), ''), r->>'descrizione'));
  v_conto := coalesce(p_conto_bene, (k->>(v_ruoli->>'bene'))::uuid);
  IF v_conto IS NULL THEN
    RAISE EXCEPTION 'Manca il conto del bene (%): sceglilo o crealo nel Piano dei conti', v_ruoli->>'bene' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cespiti (company_id, descrizione, categoria, sottocategoria, data_acquisto, costo_storico, aliquota_amm,
                              conto_bene_id, fattura_ricevuta_id, fattura_linea, created_by, note)
  VALUES (f.company_id, coalesce(nullif(btrim(p_descrizione), ''), left(r->>'descrizione', 200)), p_categoria, nullif(btrim(p_sottocategoria), ''),
          f.data_fattura, v_costo, p_aliquota, v_conto, f.id, p_linea, auth.uid(),
          'Dalla fattura ' || coalesce(f.numero_fattura, '') || ' di ' || coalesce(f.cedente_ragione_sociale, ''))
  RETURNING id INTO v_id;
  UPDATE public.fatture_ricevute SET conti_righe = conti_righe || jsonb_build_object(p_linea, 'conto:' || v_conto) WHERE id = f.id;

  SELECT * INTO s FROM public.contabilita_scritture x
   WHERE x.company_id = f.company_id AND x.origine = 'fattura_ricevuta' AND x.origine_id = f.id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = x.id)
   ORDER BY x.created_at DESC LIMIT 1;
  IF s.id IS NOT NULL THEN
    PERFORM public.contabilita_inserisci_scrittura(f.company_id, public.contabilita_data_utile(f.company_id, s.data_registrazione), 'Storno n. ' || s.numero || '/' || s.esercizio,
      'Riga ' || p_linea || ' passata fra i cespiti', NULL, NULL,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id), 'storno', s.id, s.id);
    PERFORM public.contabilita_genera_da_documenti(f.company_id, extract(year FROM f.data_fattura)::int, f.id);
    IF NOT public.contabilita_documento_registrato(f.company_id, 'fattura_ricevuta', f.id) THEN
      RAISE EXCEPTION 'La fattura non si è registrata di nuovo: niente è stato cambiato' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_riapri_esercizio(p_company uuid, p_anno integer, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE s record; v_n int := 0;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
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

CREATE OR REPLACE FUNCTION public.contabilita_riregistra_documento(p_company uuid, p_documento uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE s record; v_anno int; v_stornate int := 0; v_esito jsonb;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  FOR s IN
    SELECT * FROM public.contabilita_scritture c
     WHERE c.company_id = p_company AND c.origine_id = p_documento AND c.origine IN ('fattura_emessa', 'fattura_ricevuta')
       AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = c.id)
  LOOP
    v_anno := s.esercizio;
    -- Alla data della scrittura: storno e scrittura nuova restano nello stesso esercizio.
    PERFORM public.contabilita_inserisci_scrittura(s.company_id, s.data_registrazione, 'Storno n. ' || s.numero || '/' || s.esercizio,
      coalesce(nullif(btrim(p_motivo), ''), 'Documento registrato di nuovo'), s.documento_numero, s.documento_data,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id),
      'storno', s.id, s.id);
    v_stornate := v_stornate + 1;
  END LOOP;
  IF v_anno IS NULL THEN
    RETURN jsonb_build_object('stornate', 0, 'registrata', false);
  END IF;
  v_esito := public.contabilita_genera_da_documenti(p_company, v_anno, p_documento);
  IF jsonb_array_length(coalesce(v_esito->'errori', '[]'::jsonb)) > 0
     OR coalesce((v_esito->>'fatture_emesse')::int, 0) + coalesce((v_esito->>'fatture_ricevute')::int, 0) = 0 THEN
    RAISE EXCEPTION 'Il documento non si può registrare di nuovo (%): la scrittura di prima resta com''era',
      coalesce(v_esito->'errori'->>0, 'nessuna scrittura generata') USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('stornate', v_stornate, 'esito', v_esito);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_storna_scrittura(p_scrittura uuid, p_data date, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE s public.contabilita_scritture; v_righe jsonb;
BEGIN
  SELECT * INTO s FROM public.contabilita_scritture WHERE id = p_scrittura;
  IF NOT FOUND OR NOT public.contabilita_puo_scrivere(s.company_id) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  -- Una registrazione alla volta per azienda: due storni insieme della stessa scrittura non passano.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || s.company_id, 0));
  IF s.storno_di IS NOT NULL THEN RAISE EXCEPTION 'Uno storno non si storna: registra di nuovo la scrittura giusta' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE storno_di = p_scrittura) THEN
    RAISE EXCEPTION 'Scrittura già stornata' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_motivo, '')) = '' THEN RAISE EXCEPTION 'Serve il motivo dello storno' USING ERRCODE = '22023'; END IF;
  SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
    INTO v_righe FROM public.contabilita_righe WHERE scrittura_id = p_scrittura;
  RETURN public.contabilita_inserisci_scrittura(s.company_id, coalesce(p_data, current_date),
    'Storno n. ' || s.numero || '/' || s.esercizio, btrim(p_motivo), s.documento_numero, s.documento_data,
    v_righe, 'storno', s.id, s.id);
END $$;

