-- Contabilità generale: un piano dei conti proprio (10/11/2026).
--
-- Lo studio di un cliente tiene il suo piano dei conti (codici a 10 cifre) e
-- con quello va aperto l'esercizio. Due cose servivano:
--   · «Genera dai documenti» cercava i conti del piano standard per codice
--     (05.01 clienti, 20.01 ricavi…). Ora ogni conto può dire a quale ruolo
--     corrisponde (codice_standard): un piano proprio funziona senza rinominare.
--   · la voce CEE proposta all'importazione va confermata dallo studio: si
--     corregge con contabilita_aggiorna_conto, che cambia solo la classificazione
--     (descrizione, natura, voce CEE, ruolo), mai i movimenti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.contabilita_conti ADD COLUMN IF NOT EXISTS codice_standard text;
ALTER TABLE public.contabilita_conti ADD COLUMN IF NOT EXISTS nota text;

CREATE OR REPLACE FUNCTION public.contabilita_aggiorna_conto(
  p_conto uuid, p_descrizione text, p_natura text, p_sezione_cee text, p_voce_cee text, p_codice_standard text, p_nota text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.contabilita_conti WHERE id = p_conto;
  IF v_company IS NULL OR NOT public.contabilita_puo_scrivere(v_company) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_descrizione, '')) = '' THEN RAISE EXCEPTION 'La descrizione è obbligatoria' USING ERRCODE = '22023'; END IF;
  UPDATE public.contabilita_conti
     SET descrizione = btrim(p_descrizione), natura = p_natura, sezione_cee = nullif(p_sezione_cee, ''),
         voce_cee = nullif(btrim(coalesce(p_voce_cee, '')), ''), codice_standard = nullif(btrim(coalesce(p_codice_standard, '')), ''),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   WHERE id = p_conto;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_aggiorna_conto(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_aggiorna_conto(uuid, text, text, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_genera_da_documenti(p_company uuid, p_anno integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s' AS $$
DECLARE
  k jsonb := '{}'::jsonb;  -- codice → id del conto
  v_dal date := make_date(p_anno, 1, 1);
  v_al date := make_date(p_anno, 12, 31);
  r record; v_righe jsonb; v_nc boolean; v_conto text;
  n_em int := 0; n_ric int := 0; n_inc int := 0; n_pag int := 0;
  s_testata int := 0; s_gia int := 0; s_errori jsonb := '[]'::jsonb;
  imp numeric; iva numeric; tot numeric;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;

  -- Il ruolo di ogni conto: il codice del piano standard, oppure quello scritto in
  -- codice_standard su un conto di un piano proprio (lo studio dell'azienda).
  SELECT coalesce(jsonb_object_agg(chiave, id), '{}'::jsonb) INTO k FROM (
    SELECT DISTINCT ON (chiave) chiave, id FROM (
      SELECT coalesce(codice_standard, codice) AS chiave, id, codice_standard IS NOT NULL AS esplicito, codice
        FROM public.contabilita_conti WHERE company_id = p_company AND movimentabile AND attivo
    ) x ORDER BY chiave, esplicito DESC, codice
  ) y;
  IF NOT (k ? '05.01' AND k ? '20.01' AND k ? '13.10' AND k ? '05.10' AND k ? '13.04' AND k ? '06.01' AND k ? '30.01') THEN
    RAISE EXCEPTION 'Mancano i conti per clienti, fornitori, banca, IVA, ricavi e acquisti (05.01, 05.10, 06.01, 13.04, 13.10, 20.01, 30.01): carica il piano standard o indica a quali conti corrispondono' USING ERRCODE = '22023';
  END IF;

  -- ── Fatture emesse ──
  FOR r IN
    SELECT i.id, i.issue_date, i.invoice_number, i.client_company_name, i.document_type, i.subtotal, i.tax_amount, i.total
      FROM public.invoices i
     WHERE i.company_id = p_company AND i.deleted_at IS NULL AND i.status NOT IN ('draft', 'cancelled')
       AND i.document_type IN ('invoice', 'credit_note') AND i.issue_date BETWEEN v_dal AND v_al
     ORDER BY i.issue_date, i.invoice_number
  LOOP
    IF r.subtotal IS NULL OR r.total IS NULL THEN s_testata := s_testata + 1; CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'fattura_emessa' AND origine_id = r.id) THEN
      s_gia := s_gia + 1; CONTINUE;
    END IF;
    v_nc := r.document_type = 'credit_note';
    imp := abs(r.subtotal); iva := abs(coalesce(r.tax_amount, 0)); tot := imp + iva;
    IF tot = 0 THEN CONTINUE; END IF;
    v_righe := jsonb_build_array(
      jsonb_build_object('conto_id', k->>'05.01', CASE WHEN v_nc THEN 'avere' ELSE 'dare' END, tot, 'descrizione', r.client_company_name),
      jsonb_build_object('conto_id', k->>'20.01', CASE WHEN v_nc THEN 'dare' ELSE 'avere' END, imp));
    IF iva > 0 THEN
      v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'13.10', CASE WHEN v_nc THEN 'dare' ELSE 'avere' END, iva));
    END IF;
    BEGIN
      PERFORM public.contabilita_inserisci_scrittura(p_company, r.issue_date,
        CASE WHEN v_nc THEN 'Nota di credito emessa' ELSE 'Fattura emessa' END,
        r.client_company_name, r.invoice_number, r.issue_date, v_righe, 'fattura_emessa', r.id, NULL);
      n_em := n_em + 1;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('Fattura emessa %s: %s', r.invoice_number, SQLERRM));
    END;
  END LOOP;

  -- ── Fatture ricevute ──
  FOR r IN
    SELECT f.id, f.data_fattura, f.numero_fattura, f.cedente_ragione_sociale, f.tipo_documento,
           f.imponibile_totale, f.iva_totale, f.categoria_ai, c.category
      FROM public.fatture_ricevute f
      LEFT JOIN public.company_costs c ON c.id = f.company_cost_id
     WHERE f.company_id = p_company AND f.stato <> 'rifiutata' AND f.data_fattura BETWEEN v_dal AND v_al
     ORDER BY f.data_fattura, f.numero_fattura
  LOOP
    IF r.imponibile_totale IS NULL OR r.iva_totale IS NULL THEN s_testata := s_testata + 1; CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'fattura_ricevuta' AND origine_id = r.id) THEN
      s_gia := s_gia + 1; CONTINUE;
    END IF;
    -- Il segno dell'XML decide: un importo negativo (nota di credito, storno) va al contrario.
    v_nc := r.tipo_documento IN ('TD04', 'TD08') OR r.imponibile_totale < 0;
    imp := abs(r.imponibile_totale); iva := abs(r.iva_totale);
    IF imp + iva = 0 THEN CONTINUE; END IF;
    v_conto := public.contabilita_conto_da_categoria(coalesce(r.category, r.categoria_ai));
    IF NOT k ? v_conto THEN v_conto := '30.01'; END IF;
    v_righe := '[]'::jsonb;
    IF imp > 0 THEN
      v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>v_conto, CASE WHEN v_nc THEN 'avere' ELSE 'dare' END, imp, 'descrizione', r.cedente_ragione_sociale));
    END IF;
    IF iva > 0 THEN
      v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'05.10', CASE WHEN v_nc THEN 'avere' ELSE 'dare' END, iva));
    END IF;
    IF r.tipo_documento IN ('TD16', 'TD17', 'TD18', 'TD19') AND iva > 0 THEN
      -- Integrazione: l'IVA si detrae e insieme si deve; al fornitore va solo l'imponibile.
      v_righe := v_righe || jsonb_build_array(
        jsonb_build_object('conto_id', k->>'13.04', CASE WHEN v_nc THEN 'dare' ELSE 'avere' END, imp, 'descrizione', r.cedente_ragione_sociale),
        jsonb_build_object('conto_id', k->>'13.10', CASE WHEN v_nc THEN 'dare' ELSE 'avere' END, iva));
    ELSE
      v_righe := v_righe || jsonb_build_array(
        jsonb_build_object('conto_id', k->>'13.04', CASE WHEN v_nc THEN 'dare' ELSE 'avere' END, imp + iva, 'descrizione', r.cedente_ragione_sociale));
    END IF;
    BEGIN
      PERFORM public.contabilita_inserisci_scrittura(p_company, r.data_fattura,
        CASE WHEN v_nc THEN 'Nota di credito ricevuta' WHEN r.tipo_documento IN ('TD16','TD17','TD18','TD19') THEN 'Integrazione reverse charge' ELSE 'Fattura ricevuta' END,
        r.cedente_ragione_sociale, r.numero_fattura, r.data_fattura, v_righe, 'fattura_ricevuta', r.id, NULL);
      n_ric := n_ric + 1;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('Fattura ricevuta %s %s: %s', r.cedente_ragione_sociale, r.numero_fattura, SQLERRM));
    END;
  END LOOP;

  -- ── Incassi delle fatture emesse ──
  FOR r IN
    SELECT p.id, p.invoice_id, p.payment_date, p.amount, i.invoice_number, i.client_company_name
      FROM public.invoice_payments p JOIN public.invoices i ON i.id = p.invoice_id
     WHERE p.company_id = p_company AND p.payment_date BETWEEN v_dal AND v_al AND p.amount <> 0
     ORDER BY p.payment_date
  LOOP
    IF EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'incasso' AND origine_id = r.id) THEN
      s_gia := s_gia + 1; CONTINUE;
    END IF;
    -- Senza la fattura in contabilità, l'incasso lascerebbe i clienti in avere.
    IF NOT EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'fattura_emessa' AND origine_id = r.invoice_id) THEN
      s_testata := s_testata + 1; CONTINUE;
    END IF;
    v_righe := jsonb_build_array(
      jsonb_build_object('conto_id', k->>'06.01', CASE WHEN r.amount > 0 THEN 'dare' ELSE 'avere' END, abs(r.amount)),
      jsonb_build_object('conto_id', k->>'05.01', CASE WHEN r.amount > 0 THEN 'avere' ELSE 'dare' END, abs(r.amount), 'descrizione', r.client_company_name));
    BEGIN
      PERFORM public.contabilita_inserisci_scrittura(p_company, r.payment_date, 'Incasso fattura', r.client_company_name,
        r.invoice_number, NULL, v_righe, 'incasso', r.id, NULL);
      n_inc := n_inc + 1;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('Incasso fattura %s: %s', r.invoice_number, SQLERRM));
    END;
  END LOOP;

  -- ── Fatture emesse segnate pagate senza movimenti d'incasso (importate, gestionale esterno) ──
  FOR r IN
    SELECT i.id, coalesce(i.payment_date, i.due_date, i.issue_date) AS data, i.paid_amount, i.invoice_number, i.client_company_name
      FROM public.invoices i
     WHERE i.company_id = p_company AND i.deleted_at IS NULL AND i.document_type = 'invoice'
       AND coalesce(i.paid_amount, 0) > 0
       AND coalesce(i.payment_date, i.due_date, i.issue_date) BETWEEN v_dal AND v_al
       AND NOT EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = i.id)
     ORDER BY 2
  LOOP
    IF EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'incasso_fattura' AND origine_id = r.id) THEN
      s_gia := s_gia + 1; CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'fattura_emessa' AND origine_id = r.id) THEN
      s_testata := s_testata + 1; CONTINUE;
    END IF;
    v_righe := jsonb_build_array(
      jsonb_build_object('conto_id', k->>'06.01', 'dare', r.paid_amount),
      jsonb_build_object('conto_id', k->>'05.01', 'avere', r.paid_amount, 'descrizione', r.client_company_name));
    BEGIN
      PERFORM public.contabilita_inserisci_scrittura(p_company, r.data, 'Incasso fattura', r.client_company_name,
        r.invoice_number, NULL, v_righe, 'incasso_fattura', r.id, NULL);
      n_inc := n_inc + 1;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('Incasso fattura %s: %s', r.invoice_number, SQLERRM));
    END;
  END LOOP;

  -- ── Pagamenti delle fatture ricevute (segnate pagate) ──
  FOR r IN
    SELECT f.id, f.pagata_il, coalesce(f.netto_a_pagare, f.totale_documento) AS importo, f.numero_fattura, f.cedente_ragione_sociale, f.tipo_documento
      FROM public.fatture_ricevute f
     WHERE f.company_id = p_company AND f.pagata_il BETWEEN v_dal AND v_al AND f.stato <> 'rifiutata'
       AND f.tipo_documento NOT IN ('TD04', 'TD08', 'TD16', 'TD17', 'TD18', 'TD19')
       AND coalesce(f.netto_a_pagare, f.totale_documento, 0) > 0
     ORDER BY f.pagata_il
  LOOP
    IF EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'pagamento' AND origine_id = r.id) THEN
      s_gia := s_gia + 1; CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE company_id = p_company AND origine = 'fattura_ricevuta' AND origine_id = r.id) THEN
      s_testata := s_testata + 1; CONTINUE;
    END IF;
    v_righe := jsonb_build_array(
      jsonb_build_object('conto_id', k->>'13.04', 'dare', r.importo, 'descrizione', r.cedente_ragione_sociale),
      jsonb_build_object('conto_id', k->>'06.01', 'avere', r.importo));
    BEGIN
      PERFORM public.contabilita_inserisci_scrittura(p_company, r.pagata_il, 'Pagamento fornitore', r.cedente_ragione_sociale,
        r.numero_fattura, NULL, v_righe, 'pagamento', r.id, NULL);
      n_pag := n_pag + 1;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('Pagamento %s %s: %s', r.cedente_ragione_sociale, r.numero_fattura, SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'fatture_emesse', n_em, 'fatture_ricevute', n_ric, 'incassi', n_inc, 'pagamenti', n_pag,
    'saltate_solo_testata', s_testata, 'gia_generate', s_gia, 'errori', s_errori);
END $$;

