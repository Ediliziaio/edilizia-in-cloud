-- Prima nota, modifica: la fattura si legge senza FOR UPDATE (10/11/2026, dalla revisione).
-- FOR UPDATE passa anche dalla regola di modifica di invoices (can_manage_payments): chi registra
-- gli incassi senza quel permesso (contabile, staff con la sola fatturazione) vedeva
-- «Fattura non trovata». Il blocco sulla riga del pagamento e i trigger della fattura bastano.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.prima_nota_modifica(p_id uuid, p_dati jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  p public.prima_nota_entries; v_motivo text; v_pag public.invoice_payments; v_inv record;
  v_fattura uuid := nullif(p_dati->>'invoice_id', '')::uuid;
  v_importo numeric := round((p_dati->>'amount')::numeric, 2);
  v_data date := (p_dati->>'entry_date')::date;
  v_verso text := coalesce(p_dati->>'direction', 'uscita');
  v_n int; v_esito text := 'modificata'; v_gia numeric := 0;
BEGIN
  SELECT * INTO p FROM public.prima_nota_entries WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registrazione non trovata o non visibile.' USING ERRCODE = 'P0002'; END IF;
  v_motivo := public.prima_nota_modificabile(p);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'P0001'; END IF;
  IF v_importo IS NULL OR v_importo <= 0 THEN RAISE EXCEPTION 'L''importo deve essere maggiore di zero.' USING ERRCODE = '22023'; END IF;
  IF v_data IS NULL THEN RAISE EXCEPTION 'Manca la data.' USING ERRCODE = '22023'; END IF;
  IF btrim(coalesce(p_dati->>'description', '')) = '' THEN RAISE EXCEPTION 'Manca la descrizione.' USING ERRCODE = '22023'; END IF;
  IF v_verso NOT IN ('entrata', 'uscita') THEN RAISE EXCEPTION 'Direzione non valida.' USING ERRCODE = '22023'; END IF;
  IF v_fattura IS NOT NULL AND v_verso <> 'entrata' THEN
    RAISE EXCEPTION 'L''incasso di una fattura è un''entrata.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pag FROM public.invoice_payments
   WHERE reference = 'prima_nota:' || p.id AND company_id = p.company_id ORDER BY created_at LIMIT 1 FOR UPDATE;

  IF v_fattura IS NOT NULL THEN
    SELECT id, total, paid_amount, document_type, deleted_at INTO v_inv
      FROM public.invoices WHERE id = v_fattura AND company_id = p.company_id;
    IF NOT FOUND OR v_inv.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Fattura non trovata.' USING ERRCODE = 'P0002'; END IF;
    -- Più del residuo non si incassa (contando quello che questa registrazione aveva già messo sulla stessa fattura).
    v_gia := CASE WHEN v_pag.invoice_id = v_fattura THEN v_pag.amount ELSE 0 END;
    IF v_importo > coalesce(v_inv.total, 0) - coalesce(v_inv.paid_amount, 0) + v_gia + 0.005 THEN
      RAISE EXCEPTION 'L''importo supera quanto resta da incassare sulla fattura.' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.prima_nota_entries SET
    direction = v_verso,
    category = coalesce(nullif(p_dati->>'category', ''), category),
    description = btrim(p_dati->>'description'),
    amount = v_importo,
    entry_date = v_data,
    payment_method = nullif(p_dati->>'payment_method', ''),
    reference_number = nullif(btrim(coalesce(p_dati->>'reference_number', '')), ''),
    account_label = coalesce(nullif(p_dati->>'account_label', ''), account_label),
    supplier_id = nullif(p_dati->>'supplier_id', '')::uuid,
    order_id = nullif(p_dati->>'order_id', '')::uuid,
    invoice_id = v_fattura,
    notes = CASE WHEN p_dati ? 'notes' THEN nullif(p_dati->>'notes', '') ELSE notes END,
    attachment_url = CASE WHEN p_dati ? 'attachment_url' THEN nullif(p_dati->>'attachment_url', '') ELSE attachment_url END,
    attachment_name = CASE WHEN p_dati ? 'attachment_name' THEN nullif(p_dati->>'attachment_name', '') ELSE attachment_name END,
    updated_at = now()
  WHERE id = p.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Non hai il permesso di modificare questa registrazione.' USING ERRCODE = '42501'; END IF;

  -- Il pagamento della fattura segue la registrazione.
  IF v_pag.id IS NOT NULL AND (v_fattura IS NULL OR v_pag.invoice_id <> v_fattura) THEN
    DELETE FROM public.invoice_payments WHERE id = v_pag.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Non hai il permesso di cambiare l''incasso della fattura.' USING ERRCODE = '42501'; END IF;
    v_esito := CASE WHEN v_fattura IS NULL THEN 'fattura_tolta' ELSE 'fattura_cambiata' END;
    v_pag.id := NULL;
  END IF;
  IF v_fattura IS NOT NULL THEN
    IF v_pag.id IS NOT NULL THEN
      UPDATE public.invoice_payments
         SET amount = v_importo, payment_date = v_data, payment_method = nullif(p_dati->>'payment_method', '')
       WHERE id = v_pag.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN RAISE EXCEPTION 'Non hai il permesso di cambiare l''incasso della fattura.' USING ERRCODE = '42501'; END IF;
    ELSE
      INSERT INTO public.invoice_payments (invoice_id, company_id, amount, payment_date, payment_method, reference, notes, created_by)
      VALUES (v_fattura, p.company_id, v_importo, v_data, nullif(p_dati->>'payment_method', ''), 'prima_nota:' || p.id,
              'Incasso registrato dalla Prima nota', auth.uid());
      IF v_esito = 'modificata' THEN v_esito := 'fattura_collegata'; END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('esito', v_esito, 'invoice_id', v_fattura, 'invoice_id_prima', v_pag.invoice_id);
END $$;
REVOKE ALL ON FUNCTION public.prima_nota_modifica(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_modifica(uuid, jsonb) TO authenticated, service_role;
