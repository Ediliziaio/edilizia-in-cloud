-- ════════════════════════════════════════════════════════════════════════════
-- L'incasso dell'acconto che chiude la rata
-- ════════════════════════════════════════════════════════════════════════════
--
-- Oggi segnare incassato un acconto vuol dire mettere a mano `is_paid = true`
-- su una riga di `order_installments` e, separatamente, scrivere una riga di
-- prima nota — se ci si ricorda. Due gesti scollegati: chi guarda la cassa e
-- chi guarda lo scadenzario possono vedere due verità diverse.
--
-- `prima_nota_entries` ha già `order_id` e `installment_id`: il collegamento
-- era previsto e non veniva usato.
--
-- ── Le scelte, e perché ────────────────────────────────────────────────────
-- • Le rate si chiudono in ordine. Un acconto non paga la terza rata lasciando
--   aperta la prima.
-- • Una rata si chiude solo se l'importo la copre tutta. `order_installments`
--   non ha una colonna «pagato parzialmente»: fingere che 500 su 1.000 chiuda
--   la rata sarebbe una bugia, e scrivere 500 come se fossero 1.000 pure.
--   Quello che avanza si registra in prima nota come acconto non imputato, e
--   la risposta lo dice.
-- • Le righe si bloccano (FOR UPDATE) prima di toccarle: due incassi
--   registrati insieme non devono chiudere la stessa rata due volte.
-- • Lo stesso riferimento bancario non si registra due volte.

CREATE OR REPLACE FUNCTION public.acconto_incassa(
  p_order_id     uuid,
  p_importo      numeric,
  p_metodo       text DEFAULT 'bonifico',
  p_data         date DEFAULT NULL,
  p_riferimento  text DEFAULT NULL,
  p_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company  uuid;
  v_codice   text;
  v_data     date := coalesce(p_data, CURRENT_DATE);
  v_resta    numeric;
  r          record;
  v_chiuse   jsonb := '[]'::jsonb;
  v_totale   numeric := 0;
BEGIN
  IF p_importo IS NULL OR p_importo <= 0 THEN
    RAISE EXCEPTION 'l''importo dell''acconto deve essere positivo' USING ERRCODE = '22023';
  END IF;

  SELECT o.company_id, o.order_code INTO v_company, v_codice
    FROM public.orders o WHERE o.id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'commessa non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_permesso('can_manage_payments', 'registrare l''incasso di un acconto');

  -- Lo stesso bonifico non si registra due volte.
  IF coalesce(btrim(p_riferimento), '') <> '' AND EXISTS (
       SELECT 1 FROM public.prima_nota_entries e
        WHERE e.company_id = v_company AND e.order_id = p_order_id
          AND e.reference_number = btrim(p_riferimento)) THEN
    RETURN jsonb_build_object('ok', false,
      'motivo', format('il riferimento «%s» risulta già registrato su questa commessa',
                       btrim(p_riferimento)));
  END IF;

  v_resta := p_importo;

  -- Le rate aperte, in ordine, bloccate finché non si è finito.
  FOR r IN
    SELECT i.id, i.label, i.amount, i.position, i.expected_date
      FROM public.order_installments i
     WHERE i.order_id = p_order_id AND coalesce(i.is_paid, false) = false
     ORDER BY i.position NULLS LAST, i.expected_date NULLS LAST, i.id
       FOR UPDATE
  LOOP
    EXIT WHEN v_resta < coalesce(r.amount, 0) OR coalesce(r.amount, 0) <= 0;

    UPDATE public.order_installments
       SET is_paid = true, paid_date = v_data
     WHERE id = r.id;

    INSERT INTO public.prima_nota_entries
      (company_id, direction, category, description, amount, entry_date,
       payment_method, reference_number, order_id, installment_id,
       is_auto, auto_source, notes, created_by)
    VALUES (v_company, 'entrata', 'incasso',
            format('Incasso %s — commessa %s', coalesce(r.label, 'rata'),
                   coalesce(v_codice, '—')),
            r.amount, v_data, p_metodo, nullif(btrim(p_riferimento), ''),
            p_order_id, r.id, true, 'acconto_commessa', p_note, auth.uid());

    v_resta := v_resta - r.amount;
    v_totale := v_totale + r.amount;
    v_chiuse := v_chiuse || jsonb_build_object(
      'rata', coalesce(r.label, 'rata'), 'posizione', r.position,
      'importo', round(r.amount, 2), 'installment_id', r.id);
  END LOOP;

  -- Quello che avanza è arrivato lo stesso: si registra, ma non si finge che
  -- abbia chiuso una rata.
  IF v_resta > 0 THEN
    INSERT INTO public.prima_nota_entries
      (company_id, direction, category, description, amount, entry_date,
       payment_method, reference_number, order_id,
       is_auto, auto_source, notes, created_by)
    VALUES (v_company, 'entrata', 'incasso',
            format('Acconto non imputato a rata — commessa %s', coalesce(v_codice, '—')),
            v_resta, v_data, p_metodo, nullif(btrim(p_riferimento), ''),
            p_order_id, true, 'acconto_commessa', p_note, auth.uid());
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id, 'commessa', v_codice,
    'incassato', round(p_importo, 2),
    'rate_chiuse', v_chiuse,
    'imputato_a_rate', round(v_totale, 2),
    'residuo_non_imputato', round(v_resta, 2),
    'nota', CASE
      WHEN jsonb_array_length(v_chiuse) = 0 AND v_resta > 0
        THEN 'Nessuna rata chiusa: l''importo non copre per intero la prima rata aperta. La somma è comunque in prima nota.'
      WHEN v_resta > 0
        THEN 'Il residuo è in prima nota come acconto non imputato: non basta a chiudere la rata successiva.'
      ELSE 'Importo interamente imputato alle rate.' END);
END $function$;

COMMENT ON FUNCTION public.acconto_incassa(uuid, numeric, text, date, text, text) IS
  'Registra l''incasso di un acconto e chiude le rate che copre, in ordine, nella stessa transazione. Una rata si chiude solo se l''importo la copre tutta: order_installments non sa rappresentare un pagamento parziale, e fingerlo sarebbe una bugia.';

REVOKE ALL ON FUNCTION public.acconto_incassa(uuid, numeric, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acconto_incassa(uuid, numeric, text, date, text, text) TO authenticated, service_role;
