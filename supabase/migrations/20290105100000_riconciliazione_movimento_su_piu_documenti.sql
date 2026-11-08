-- Un movimento della banca su più documenti (08/11/2026).
--
-- Fino a oggi una riga di bank_reconciliations per movimento: un bonifico che
-- pagava tre fatture, o un acconto diviso su due, non si poteva registrare.
-- Ora un movimento si ripartisce su fatture interne, fatture importate o (per le
-- uscite) scadenze fornitore, per l'importo scelto riga per riga. Quel che resta
-- si abbina dopo: il movimento è «parziale» finché non è coperto tutto.
--
-- Le righe ripartite hanno ripartita = true. Il vincolo «una riga attiva per
-- movimento» resta per tutte le altre, così i percorsi a riga singola e l'auto-match
-- continuano a non poter consumare due volte lo stesso bonifico.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.bank_reconciliations
  ADD COLUMN IF NOT EXISTS ripartita boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bank_reconciliations.ripartita IS
  'Riga di un movimento diviso su più documenti (riconcilia_movimento_su_documenti).';

CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliations_attiva_singola_uidx
  ON public.bank_reconciliations (transaction_id)
  WHERE unmatched_at IS NULL AND NOT ripartita;
DROP INDEX IF EXISTS public.bank_reconciliations_active_tx_uidx;

-- Lo stesso documento una volta sola per movimento.
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliations_ripartita_documento_uidx
  ON public.bank_reconciliations (transaction_id, coalesce(documento_id, invoice_id, scadenza_id))
  WHERE unmatched_at IS NULL AND ripartita;

ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_reconciliation_status_check;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_reconciliation_status_check
  CHECK (reconciliation_status = ANY (ARRAY['pending', 'parziale', 'reconciled', 'suggestion', 'ignored']));

-- Lo stato del movimento segue le righe ripartite ancora attive.
CREATE OR REPLACE FUNCTION private.movimento_ripartito_ricalcola()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_abbinato numeric;
BEGIN
  SELECT coalesce(sum(matched_amount), 0) INTO v_abbinato
    FROM public.bank_reconciliations
   WHERE transaction_id = NEW.transaction_id AND unmatched_at IS NULL AND ripartita;
  UPDATE public.bank_transactions t
     SET reconciliation_status = CASE
           WHEN v_abbinato <= 0 THEN 'pending'
           WHEN v_abbinato >= abs(t.amount) - 0.005 THEN 'reconciled'
           ELSE 'parziale' END,
         reconciled_at = CASE WHEN v_abbinato >= abs(t.amount) - 0.005 THEN now() END
   WHERE t.id = NEW.transaction_id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.movimento_ripartito_ricalcola() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_movimento_ripartito_ricalcola_ins ON public.bank_reconciliations;
CREATE TRIGGER trg_movimento_ripartito_ricalcola_ins
  AFTER INSERT ON public.bank_reconciliations
  FOR EACH ROW WHEN (NEW.ripartita)
  EXECUTE FUNCTION private.movimento_ripartito_ricalcola();

DROP TRIGGER IF EXISTS trg_movimento_ripartito_ricalcola_upd ON public.bank_reconciliations;
CREATE TRIGGER trg_movimento_ripartito_ricalcola_upd
  AFTER UPDATE OF unmatched_at ON public.bank_reconciliations
  FOR EACH ROW WHEN (NEW.ripartita AND OLD.unmatched_at IS DISTINCT FROM NEW.unmatched_at)
  EXECUTE FUNCTION private.movimento_ripartito_ricalcola();

-- Chi annulla un incasso rimette il movimento a «pending» senza sapere delle
-- altre righe (storna_incasso_atomico, scollega_bonifico_fattura): se ne restano
-- di attive, il movimento è parziale.
CREATE OR REPLACE FUNCTION private.movimento_ripartito_non_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bank_reconciliations
              WHERE transaction_id = NEW.id AND unmatched_at IS NULL AND ripartita) THEN
    NEW.reconciliation_status := 'parziale';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.movimento_ripartito_non_pending() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_movimento_ripartito_non_pending ON public.bank_transactions;
CREATE TRIGGER trg_movimento_ripartito_non_pending
  BEFORE UPDATE OF reconciliation_status ON public.bank_transactions
  FOR EACH ROW WHEN (NEW.reconciliation_status = 'pending' AND OLD.reconciliation_status <> 'pending')
  EXECUTE FUNCTION private.movimento_ripartito_non_pending();

-- p_righe: [{"tipo":"documento"|"invoice"|"scadenza","id":"…","importo":123.45}]
CREATE OR REPLACE FUNCTION public.riconcilia_movimento_su_documenti(
  p_transazione uuid, p_righe jsonb, p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t public.bank_transactions;
  r record; d record; i record; s public.scadenze;
  v_company uuid; v_abbinato numeric; v_resto numeric; v_somma numeric; v_residuo numeric;
  v_data date; v_mov uuid; v_scad uuid; v_rec uuid; v_pn uuid; v_esito jsonb;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_esterne jsonb := '[]'::jsonb;
  v_conta int := 0;
BEGIN
  SELECT company_id INTO v_company FROM public.bank_transactions WHERE id = p_transazione;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR public.user_can_access_company(v_company) IS NOT TRUE
     OR public.utente_sola_lettura(v_company) THEN
    RAISE EXCEPTION 'Riconciliazione non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF p_righe IS NULL OR jsonb_typeof(p_righe) <> 'array' OR jsonb_array_length(p_righe) = 0 THEN
    RAISE EXCEPTION 'Scegli almeno un documento.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_righe) > 100 THEN
    RAISE EXCEPTION 'Troppi documenti in una volta: al massimo 100.' USING ERRCODE = '22023';
  END IF;

  -- Stesso lucchetto dei pagamenti: incassi, uscite e annulli dell'azienda in fila.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 2810));
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_transazione FOR UPDATE;

  IF t.transaction_type = 'credit' AND NOT public.puo_incassare_fatture(v_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare incassi.' USING ERRCODE = '42501';
  END IF;
  IF t.transaction_type = 'debit' AND NOT public.puo_gestire_scadenze(v_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare pagamenti.' USING ERRCODE = '42501';
  END IF;
  IF t.transaction_type NOT IN ('credit', 'debit') OR coalesce(t.currency, 'EUR') <> 'EUR' THEN
    RAISE EXCEPTION 'Questo movimento non si può ripartire.' USING ERRCODE = '22023';
  END IF;
  IF t.reconciliation_status = 'ignored'
     OR t.linked_invoice_id IS NOT NULL OR t.linked_installment_id IS NOT NULL
     OR t.linked_scadenza_id IS NOT NULL OR t.linked_cost_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.bank_reconciliations x
                 WHERE x.transaction_id = t.id AND x.unmatched_at IS NULL AND NOT x.ripartita) THEN
    RAISE EXCEPTION 'Questo movimento bancario è già abbinato.' USING ERRCODE = '23505';
  END IF;

  SELECT coalesce(sum(matched_amount), 0) INTO v_abbinato
    FROM public.bank_reconciliations
   WHERE transaction_id = t.id AND unmatched_at IS NULL AND ripartita;
  IF v_abbinato = 0 AND EXISTS (SELECT 1 FROM public.prima_nota_entries WHERE bank_transaction_id = t.id) THEN
    RAISE EXCEPTION 'Questo movimento bancario è già abbinato.' USING ERRCODE = '23505';
  END IF;
  v_resto := round(abs(t.amount) - v_abbinato, 2);
  v_data := coalesce(t.booking_date, (now() AT TIME ZONE 'Europe/Rome')::date);

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric)
     WHERE x.id IS NULL OR x.importo IS NULL OR x.importo <= 0 OR x.importo <> round(x.importo, 2)
        OR x.tipo IS NULL
        OR (t.transaction_type = 'credit' AND x.tipo NOT IN ('documento', 'invoice'))
        OR (t.transaction_type = 'debit' AND x.tipo <> 'scadenza')) THEN
    RAISE EXCEPTION 'Righe non valide: controlla documenti e importi.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric)
     GROUP BY x.tipo, x.id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Lo stesso documento compare due volte.' USING ERRCODE = '22023';
  END IF;
  SELECT sum(x.importo) INTO v_somma
    FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric);
  IF v_somma > v_resto THEN
    RAISE EXCEPTION 'Stai abbinando % € ma sul movimento restano % €.', v_somma, v_resto USING ERRCODE = '22023';
  END IF;

  -- In ordine di id: due ripartizioni parallele non si incastrano.
  FOR r IN
    SELECT x.tipo, x.id, x.importo
      FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric)
     ORDER BY x.tipo, x.id
  LOOP
    v_conta := v_conta + 1;

    IF r.tipo = 'documento' THEN
      SELECT id, company_id, numero, stato, totale_da_pagare, importo_pagato INTO d
        FROM public.documenti_fiscali WHERE id = r.id AND deleted_at IS NULL FOR UPDATE;
      IF NOT FOUND OR d.company_id <> v_company THEN
        RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF d.stato IN ('bozza', 'annullata', 'stornata', 'in_invio') THEN
        RAISE EXCEPTION 'La fattura n. % adesso non si può incassare (stato: %).', d.numero, d.stato USING ERRCODE = '22023';
      END IF;
      v_residuo := round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0)
                         - public.documento_stornato_totale(d.id), 2);
      IF r.importo > v_residuo THEN
        RAISE EXCEPTION 'Sulla fattura n. % restano % €: non puoi abbinarne %.', d.numero, v_residuo, r.importo USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.transaction_id = t.id AND x.documento_id = d.id AND x.unmatched_at IS NULL) THEN
        RAISE EXCEPTION 'La fattura n. % è già su questo movimento.', d.numero USING ERRCODE = '23505';
      END IF;
      v_mov := public.registra_incasso_atomico(
        v_company, d.id, r.importo, 'bonifico', v_data,
        left(coalesce(nullif(btrim(t.description), ''), 'Bonifico'), 140),
        '[BANCA:' || t.id::text || ']');
      UPDATE public.prima_nota_entries SET bank_transaction_id = t.id WHERE movimento_id = v_mov;
      SELECT id INTO v_scad FROM public.scadenze
       WHERE company_id = v_company AND notes LIKE '%[DOC:' || d.id::text || ']%' AND status <> 'annullata'
       LIMIT 1;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, scadenza_id, movimento_id, matched_amount,
        match_type, matched_at, matched_by, notes, ripartita)
      VALUES (v_company, t.id, v_scad, v_mov, r.importo, 'manual', now(), auth.uid(),
        'Fattura n. ' || d.numero || coalesce(' · ' || v_nota, ''), true);

    ELSIF r.tipo = 'invoice' THEN
      SELECT id, company_id, invoice_number, status, total, paid_amount, external_provider, deleted_at INTO i
        FROM public.invoices WHERE id = r.id FOR UPDATE;
      IF NOT FOUND OR i.company_id <> v_company OR i.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF i.status NOT IN ('issued', 'sent', 'delivered', 'overdue') THEN
        RAISE EXCEPTION 'La fattura n. % adesso non si può incassare (stato: %).', i.invoice_number, i.status USING ERRCODE = '22023';
      END IF;
      v_residuo := round(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 2);
      IF r.importo > v_residuo THEN
        RAISE EXCEPTION 'Sulla fattura n. % restano % €: non puoi abbinarne %.', i.invoice_number, v_residuo, r.importo USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.transaction_id = t.id AND x.invoice_id = i.id AND x.unmatched_at IS NULL) THEN
        RAISE EXCEPTION 'La fattura n. % è già su questo movimento.', i.invoice_number USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, invoice_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita)
      VALUES (v_company, t.id, i.id, r.importo, 'manual', now(), auth.uid(), v_nota, true)
      RETURNING id INTO v_rec;
      INSERT INTO public.invoice_payments (invoice_id, company_id, amount, payment_date, payment_method, reference, notes)
      VALUES (i.id, v_company, r.importo, v_data, 'bonifico', 'recon:' || v_rec::text, 'Riconciliazione bancaria (ripartita)');
      IF i.external_provider IS NOT NULL THEN
        v_esterne := v_esterne || jsonb_build_object(
          'invoice_id', i.id, 'numero', i.invoice_number, 'importo', r.importo, 'provider', i.external_provider,
          'saldata', r.importo >= v_residuo - 0.005);
      END IF;

    ELSE
      SELECT * INTO s FROM public.scadenze WHERE id = r.id AND company_id = v_company FOR UPDATE;
      IF s.id IS NULL OR s.direction <> 'uscita' OR s.status = 'annullata' THEN
        RAISE EXCEPTION 'Scadenza non compatibile con questa uscita.' USING ERRCODE = '22023';
      END IF;
      v_residuo := round(coalesce(s.amount, 0) - coalesce(s.paid_amount, 0), 2);
      IF r.importo > v_residuo THEN
        RAISE EXCEPTION 'Su «%» restano % €: non puoi abbinarne %.', s.description, v_residuo, r.importo USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.transaction_id = t.id AND x.scadenza_id = s.id AND x.unmatched_at IS NULL) THEN
        RAISE EXCEPTION 'Questa scadenza è già su questo movimento.' USING ERRCODE = '23505';
      END IF;
      -- La richiesta deriva da movimento e scadenza: ripetere non paga due volte.
      v_esito := public.mark_scadenza_paid_con_richiesta(
        s.id, r.importo, 'bonifico', v_data, NULL, 'banca',
        md5(t.id::text || ':' || s.id::text)::uuid)::jsonb;
      IF v_esito ? 'error' THEN RAISE EXCEPTION '%', v_esito ->> 'error'; END IF;
      v_pn := (v_esito ->> 'prima_nota_entry_id')::uuid;
      IF v_pn IS NULL THEN RAISE EXCEPTION 'Pagamento non registrato'; END IF;
      UPDATE public.prima_nota_entries SET bank_transaction_id = t.id WHERE id = v_pn AND company_id = v_company;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, scadenza_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita)
      VALUES (v_company, t.id, s.id, r.importo, 'manual', now(), auth.uid(), '[PAGAMENTO_UNICO] ' || v_pn::text, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'righe', v_conta,
    'abbinato', round(v_abbinato + v_somma, 2),
    'resto', round(v_resto - v_somma, 2),
    'esterne', v_esterne);
END $$;

REVOKE ALL ON FUNCTION public.riconcilia_movimento_su_documenti(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riconcilia_movimento_su_documenti(uuid, jsonb, text) TO authenticated, service_role;

-- Togliere una riga sola di un movimento ripartito. Le fatture interne passano
-- da scollega_bonifico_fattura, che storna l'incasso.
CREATE OR REPLACE FUNCTION public.scollega_riga_ripartita(p_riconciliazione uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  rc public.bank_reconciliations;
  v_provider text;
BEGIN
  SELECT * INTO rc FROM public.bank_reconciliations WHERE id = p_riconciliazione;
  IF rc.id IS NULL THEN
    RAISE EXCEPTION 'Riconciliazione non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR public.user_can_access_company(rc.company_id) IS NOT TRUE
     OR public.utente_sola_lettura(rc.company_id) THEN
    RAISE EXCEPTION 'Riconciliazione non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF NOT rc.ripartita THEN
    RAISE EXCEPTION 'Questa riconciliazione non è ripartita.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(rc.company_id::text, 2810));
  PERFORM 1 FROM public.bank_transactions WHERE id = rc.transaction_id FOR UPDATE;
  SELECT * INTO rc FROM public.bank_reconciliations WHERE id = p_riconciliazione FOR UPDATE;
  IF rc.unmatched_at IS NOT NULL THEN
    RETURN jsonb_build_object('gia_scollegata', true);
  END IF;

  IF rc.movimento_id IS NOT NULL THEN
    IF NOT public.puo_incassare_fatture(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare gli incassi.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.storna_incasso_atomico(rc.company_id, rc.movimento_id);
    RETURN jsonb_build_object('tipo', 'documento');
  END IF;

  IF rc.invoice_id IS NOT NULL THEN
    IF NOT public.puo_incassare_fatture(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare gli incassi.' USING ERRCODE = '42501';
    END IF;
    SELECT external_provider INTO v_provider FROM public.invoices WHERE id = rc.invoice_id FOR UPDATE;
    DELETE FROM public.invoice_payments WHERE invoice_id = rc.invoice_id AND reference = 'recon:' || rc.id::text;
    UPDATE public.bank_reconciliations SET unmatched_at = now(), unmatch_reason = 'Riga scollegata' WHERE id = rc.id;
    RETURN jsonb_build_object('tipo', 'invoice', 'invoice_id', rc.invoice_id, 'importo', rc.matched_amount, 'provider', v_provider);
  END IF;

  -- Uscita: come per la riga singola, scollegare la banca non annulla il pagamento.
  IF NOT public.puo_gestire_scadenze(rc.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di modificare i pagamenti.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.prima_nota_entries SET bank_transaction_id = NULL
   WHERE company_id = rc.company_id AND bank_transaction_id = rc.transaction_id
     AND id = nullif(substr(coalesce(rc.notes, ''), length('[PAGAMENTO_UNICO] ') + 1), '')::uuid;
  UPDATE public.bank_reconciliations SET unmatched_at = now(), unmatch_reason = 'Riga scollegata' WHERE id = rc.id;
  RETURN jsonb_build_object('tipo', 'scadenza');
END $$;

REVOKE ALL ON FUNCTION public.scollega_riga_ripartita(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scollega_riga_ripartita(uuid) TO authenticated, service_role;
