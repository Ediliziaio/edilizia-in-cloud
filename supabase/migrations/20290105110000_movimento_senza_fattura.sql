-- Movimenti della banca che non hanno una fattura (08/11/2026): una multa, una
-- ricevuta, il carburante, gli stipendi, un giroconto. Due strade:
--   'spesa'        crea il costo «senza fattura» e lo paga con questo movimento
--                  (entra nei costi, nella commessa o sul mezzo);
--   'nessun_costo' chiude il movimento con la sua categoria e basta: stipendi e
--                  F24 hanno già il loro costo altrove, giroconti e rimborsi non sono costi.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS chiuso_senza_documento text
  CHECK (chiuso_senza_documento IS NULL OR chiuso_senza_documento IN ('spesa', 'nessun_costo'));

-- Un movimento chiuso così non si abbina più: vale per ogni percorso, auto-match compreso.
CREATE OR REPLACE FUNCTION private.movimento_chiuso_non_si_abbina()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bank_transactions
              WHERE id = NEW.transaction_id AND chiuso_senza_documento IS NOT NULL) THEN
    RAISE EXCEPTION 'Questo movimento è chiuso senza fattura: riaprilo prima di abbinarlo.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.movimento_chiuso_non_si_abbina() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_movimento_chiuso_non_si_abbina ON public.bank_reconciliations;
CREATE TRIGGER trg_movimento_chiuso_non_si_abbina
  BEFORE INSERT ON public.bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION private.movimento_chiuso_non_si_abbina();

CREATE OR REPLACE FUNCTION public.chiudi_movimento_senza_fattura(
  p_transazione uuid,
  p_tipo text,
  p_categoria text,
  p_descrizione text DEFAULT NULL,
  p_categoria_costo text DEFAULT 'altro',
  p_riferimento text DEFAULT NULL,
  p_commessa uuid DEFAULT NULL,
  p_mezzo uuid DEFAULT NULL,
  p_fornitore uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t public.bank_transactions;
  v_company uuid; v_data date; v_costo uuid; v_rif text := nullif(btrim(coalesce(p_riferimento, '')), '');
  v_desc text := nullif(btrim(coalesce(p_descrizione, '')), '');
  v_cat text := nullif(btrim(coalesce(p_categoria, '')), '');
BEGIN
  SELECT company_id INTO v_company FROM public.bank_transactions WHERE id = p_transazione;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR public.user_can_access_company(v_company) IS NOT TRUE
     OR public.utente_sola_lettura(v_company)
     OR NOT (public.puo_gestire_scadenze(v_company) OR public.puo_incassare_fatture(v_company)) THEN
    RAISE EXCEPTION 'Operazione non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('spesa', 'nessun_costo') OR v_cat IS NULL OR length(v_cat) > 60 THEN
    RAISE EXCEPTION 'Scegli di cosa si tratta.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 2810));
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_transazione FOR UPDATE;

  IF t.chiuso_senza_documento IS NOT NULL OR t.reconciliation_status IN ('reconciled', 'parziale', 'ignored')
     OR t.linked_invoice_id IS NOT NULL OR t.linked_installment_id IS NOT NULL
     OR t.linked_scadenza_id IS NOT NULL OR t.linked_cost_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.bank_reconciliations x WHERE x.transaction_id = t.id AND x.unmatched_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.prima_nota_entries p WHERE p.bank_transaction_id = t.id) THEN
    RAISE EXCEPTION 'Questo movimento bancario è già abbinato.' USING ERRCODE = '23505';
  END IF;

  IF p_tipo = 'spesa' THEN
    IF t.transaction_type <> 'debit' THEN
      RAISE EXCEPTION 'Una spesa si registra su un''uscita.' USING ERRCODE = '22023';
    END IF;
    IF v_desc IS NULL THEN
      RAISE EXCEPTION 'Scrivi di cosa si tratta.' USING ERRCODE = '22023';
    END IF;
    IF p_commessa IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.orders WHERE id = p_commessa AND company_id = v_company AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Commessa non trovata' USING ERRCODE = 'P0002';
    END IF;
    IF p_fornitore IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.suppliers WHERE id = p_fornitore AND company_id = v_company) THEN
      RAISE EXCEPTION 'Fornitore non trovato' USING ERRCODE = 'P0002';
    END IF;
    v_data := coalesce(t.booking_date, (now() AT TIME ZONE 'Europe/Rome')::date);
    INSERT INTO public.company_costs (
      company_id, name, amount, vat_rate, cost_type, recurrence, category, senza_fattura, due_date,
      documento_data, documento_riferimento, mese_competenza, supplier_id, order_id, mezzo_id, payment_method, notes)
    VALUES (
      v_company, left(v_desc, 200), abs(t.amount), 0, 'variable', 'once',
      coalesce(nullif(btrim(p_categoria_costo), ''), 'altro'), true, v_data,
      v_data, v_rif, date_trunc('month', v_data)::date, p_fornitore, p_commessa, p_mezzo, 'bonifico',
      '[BANCA:' || t.id::text || ']')
    RETURNING id INTO v_costo;
    PERFORM public.registra_pagamento_costo(v_costo, md5(t.id::text)::uuid, abs(t.amount), v_data, 'bonifico', v_rif, t.id);
  ELSE
    UPDATE public.bank_transactions
       SET reconciliation_status = 'reconciled', reconciled_at = now()
     WHERE id = t.id;
  END IF;

  UPDATE public.bank_transactions
     SET chiuso_senza_documento = p_tipo, category = v_cat,
         note = coalesce(CASE WHEN p_tipo = 'nessun_costo' THEN v_desc END, note)
   WHERE id = t.id;

  RETURN jsonb_build_object('tipo', p_tipo, 'costo_id', v_costo);
END $$;
REVOKE ALL ON FUNCTION public.chiudi_movimento_senza_fattura(uuid, text, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chiudi_movimento_senza_fattura(uuid, text, text, text, text, text, uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.riapri_movimento_senza_fattura(p_transazione uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t public.bank_transactions;
  v_company uuid; v_costo uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.bank_transactions WHERE id = p_transazione;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR public.user_can_access_company(v_company) IS NOT TRUE
     OR public.utente_sola_lettura(v_company)
     OR NOT (public.puo_gestire_scadenze(v_company) OR public.puo_incassare_fatture(v_company)) THEN
    RAISE EXCEPTION 'Operazione non autorizzata' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 2810));
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_transazione FOR UPDATE;
  IF t.chiuso_senza_documento IS NULL THEN
    RETURN jsonb_build_object('gia_aperto', true);
  END IF;

  IF t.chiuso_senza_documento = 'spesa' THEN
    PERFORM public.spesa_pagamento_autorizza(v_company);
    v_costo := t.linked_cost_id;
    IF v_costo IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.fatture_ricevute f WHERE f.company_cost_id = v_costo) THEN
        RAISE EXCEPTION 'A questa spesa è stata collegata una fattura: scollegala prima.' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM public.prima_nota_entries p
                  WHERE p.cost_id = v_costo AND p.bank_transaction_id IS DISTINCT FROM t.id) THEN
        RAISE EXCEPTION 'Questa spesa ha altri pagamenti: va controllata dai costi.' USING ERRCODE = '23514';
      END IF;
      DELETE FROM public.prima_nota_entries WHERE cost_id = v_costo AND bank_transaction_id = t.id;
      UPDATE public.bank_transactions SET linked_cost_id = NULL WHERE id = t.id;
      DELETE FROM public.company_costs WHERE id = v_costo AND company_id = v_company AND senza_fattura;
    END IF;
  END IF;

  UPDATE public.bank_transactions
     SET chiuso_senza_documento = NULL, reconciliation_status = 'pending', reconciled_at = NULL, linked_cost_id = NULL
   WHERE id = t.id;
  RETURN jsonb_build_object('riaperto', true, 'costo_tolto', v_costo);
END $$;
REVOKE ALL ON FUNCTION public.riapri_movimento_senza_fattura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riapri_movimento_senza_fattura(uuid) TO authenticated, service_role;
