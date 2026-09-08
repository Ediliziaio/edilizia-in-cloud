-- Audit crea/cancella del 7 settembre 2026, terza parte. Due funzioni che
-- rispondevano con un messaggio sbagliato o grezzo, provate con rollback:
--
--  1. documenti_fiscali_proteggi_emessi: su un documento GIA' annullato diceva
--     «in stato "annullata" non si cancella … Annullalo (stato = annullata)».
--     Il blocco e' giusto (la conservazione vale anche per gli annullati), il
--     consiglio no.
--  2. create_order_atomic: senza uno stato iniziale finiva in
--     «null value in column "status_id" of relation "order_status_history"»,
--     e il blocco EXCEPTION rilanciava TUTTO come P0001 con il prefisso
--     "create_order_atomic failed:", cancellando il codice del vincolo e
--     impedendo al client di tradurlo. Ora: stato passato, altrimenti quello
--     predefinito dell'azienda, altrimenti un messaggio che dice cosa fare;
--     e il rilancio conserva SQLSTATE.

CREATE OR REPLACE FUNCTION public.documenti_fiscali_proteggi_emessi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_consentiti text[] := public.documento_fiscale_campi_modificabili();
  v_prima      jsonb;
  v_dopo       jsonb;
  v_campo      text;
  v_violati    text[] := '{}';
  v_toccati    text[] := '{}';
  v_diff       jsonb  := '{}'::jsonb;
  v_motivo     text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
      -- Il consiglio dipende dallo stato: a un documento gia' annullato non
      -- si puo' dire "annullalo".
      IF OLD.stato = 'annullata' THEN
        v_motivo := format(
          'Un documento %s annullato non si cancella: la conservazione è obbligatoria anche per i documenti annullati. Resta nello storico.',
          OLD.tipo);
      ELSE
        v_motivo := format(
          'Un documento %s in stato "%s" non si cancella: la conservazione è obbligatoria. Se non vale più, annullalo: resterà nello storico come annullato.',
          OLD.tipo, OLD.stato);
      END IF;
      RAISE LOG 'documenti_fiscali: DELETE rifiutata su % (% %) da % / %',
        OLD.id, OLD.tipo, OLD.stato, coalesce(auth.uid()::text,'—'), current_user;
      RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
    RETURN NEW;
  END IF;

  v_prima := to_jsonb(OLD);
  v_dopo  := to_jsonb(NEW);

  FOR v_campo IN SELECT jsonb_object_keys(v_dopo) LOOP
    IF v_prima -> v_campo IS DISTINCT FROM v_dopo -> v_campo THEN
      v_toccati := v_toccati || v_campo;
      v_diff := v_diff || jsonb_build_object(v_campo, jsonb_build_object(
        'prima', left(coalesce(v_prima ->> v_campo, ''), 500),
        'dopo',  left(coalesce(v_dopo  ->> v_campo, ''), 500)
      ));
      IF NOT (v_campo = ANY(v_consentiti)) THEN
        v_violati := v_violati || v_campo;
      END IF;
    END IF;
  END LOOP;

  IF NEW.stato = 'bozza' AND OLD.stato IS DISTINCT FROM 'bozza' THEN
    -- ::text obbligatorio: `text[] || 'letterale'` viene risolto come
    -- concatenazione fra array, il letterale viene letto come array literal e
    -- salta fuori un 22P02 al posto del messaggio giusto.
    v_violati := v_violati || 'stato→bozza'::text;
  END IF;

  IF cardinality(v_violati) > 0 THEN
    v_motivo := format(
      'Documento %s n. %s in stato "%s": non si possono modificare %s. Per correggerlo emetti una nota di credito.',
      OLD.tipo, OLD.numero, OLD.stato, array_to_string(v_violati, ', '));

    RAISE LOG 'documenti_fiscali: UPDATE rifiutata su % (% n.% %) campi=% da % / %',
      OLD.id, OLD.tipo, OLD.numero, OLD.stato,
      array_to_string(v_violati, ','), coalesce(auth.uid()::text,'—'), current_user;

    RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_toccati) > 0
     AND v_toccati <> ARRAY['updated_at']::text[] THEN
    INSERT INTO public.documenti_fiscali_storico (
      documento_id, company_id, operazione, esito,
      stato_prima, stato_dopo, campi, differenze
    ) VALUES (
      OLD.id, OLD.company_id, 'update', 'applicata',
      OLD.stato, NEW.stato, v_toccati, v_diff
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order_data jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_salesperson jsonb DEFAULT NULL::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_installments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id          UUID;
  v_company_id        UUID;
  v_caller_id         UUID;
  v_status_id         UUID;
  v_item              JSONB;
  v_item_id           UUID;
  v_stock_item_id     UUID;
  v_qty               INTEGER;
  v_commission_type   TEXT;
  v_commission_value  NUMERIC;
  v_commission_amount NUMERIC;
  v_total_amount      NUMERIC;
  v_inst              JSONB;
BEGIN
  v_caller_id  := COALESCE(auth.uid(), p_user_id);
  v_company_id := (p_order_data->>'company_id')::uuid;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'create_order_atomic: utente non autenticato';
  END IF;

  IF NOT (
    has_role(v_caller_id, 'super_admin'::app_role)
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND company_id = v_company_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'create_order_atomic: non autorizzato per la company %', v_company_id;
  END IF;

  PERFORM public.assert_permesso('can_edit_orders', 'creare una commessa');

  v_total_amount := COALESCE((p_order_data->>'total_amount')::numeric, 0);

  -- Stato iniziale: quello passato, altrimenti il predefinito dell'azienda.
  -- Senza questo, order_status_history.status_id (NOT NULL) rispondeva con il
  -- vincolo grezzo a chi creava la commessa senza scegliere uno stato.
  v_status_id := NULLIF(p_order_data->>'current_status_id', '')::uuid;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id
      FROM public.order_statuses
     WHERE company_id = v_company_id
     ORDER BY is_default DESC NULLS LAST, position ASC NULLS LAST, created_at ASC
     LIMIT 1;
  END IF;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'Per creare una commessa serve almeno uno stato ordine: configuralo in Impostazioni → Stati ordine.';
  END IF;

  INSERT INTO public.orders (
    company_id, customer_id, order_code, description,
    total_amount, deposit_amount, deposit_2_amount, financing_amount,
    payment_type, balance_amount, expected_date, internal_notes,
    current_status_id, vat_rate, warehouse_arrival_date,
    work_start_date, work_end_date,
    deposit_paid, deposit_paid_date,
    deposit_2_paid, deposit_2_paid_date,
    balance_paid, balance_paid_date,
    balance_expected_date, deposit_expected_date, deposit_2_expected_date,
    financing_paid, financing_paid_date, financing_expected_date,
    financing_cost, has_building_bonus, assigned_to
  ) VALUES (
    v_company_id,
    (p_order_data->>'customer_id')::uuid,
    NULLIF(TRIM(p_order_data->>'order_code'), ''),
    p_order_data->>'description',
    v_total_amount,
    COALESCE((p_order_data->>'deposit_amount')::numeric, 0),
    COALESCE((p_order_data->>'deposit_2_amount')::numeric, 0),
    COALESCE((p_order_data->>'financing_amount')::numeric, 0),
    COALESCE(p_order_data->>'payment_type', 'standard'),
    COALESCE((p_order_data->>'balance_amount')::numeric, 0),
    (p_order_data->>'expected_date')::date,
    NULLIF(p_order_data->>'internal_notes', ''),
    v_status_id,
    COALESCE((p_order_data->>'vat_rate')::numeric, 22),
    (p_order_data->>'warehouse_arrival_date')::date,
    (p_order_data->>'work_start_date')::date,
    (p_order_data->>'work_end_date')::date,
    COALESCE((p_order_data->>'deposit_paid')::boolean, false),
    (p_order_data->>'deposit_paid_date')::date,
    COALESCE((p_order_data->>'deposit_2_paid')::boolean, false),
    (p_order_data->>'deposit_2_paid_date')::date,
    COALESCE((p_order_data->>'balance_paid')::boolean, false),
    (p_order_data->>'balance_paid_date')::date,
    (p_order_data->>'balance_expected_date')::date,
    (p_order_data->>'deposit_expected_date')::date,
    (p_order_data->>'deposit_2_expected_date')::date,
    COALESCE((p_order_data->>'financing_paid')::boolean, false),
    (p_order_data->>'financing_paid_date')::date,
    (p_order_data->>'financing_expected_date')::date,
    COALESCE((p_order_data->>'financing_cost')::numeric, 0),
    COALESCE((p_order_data->>'has_building_bonus')::boolean, false),
    NULLIF(p_order_data->>'assigned_to', '')::uuid
  )
  RETURNING id INTO v_order_id;

  -- Status history
  INSERT INTO public.order_status_history (order_id, status_id, changed_by)
  VALUES (v_order_id, v_status_id, v_caller_id);

  -- Order items + stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := NULLIF(v_item->>'stock_item_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::integer, 1);

    INSERT INTO public.order_items (
      order_id, name, description, quantity, status, position,
      supplier_id, purchase_price, vat_rate, stock_item_id,
      unit_price, discount_percent, standard_cost,
      is_paid, paid_date, payment_method,
      deposit_amount, deposit_paid, deposit_paid_date,
      balance_amount, balance_paid, balance_paid_date,
      balance_expected_date, deposit_expected_date,
      product_code, family_id, axis_selections, misure_preventivo, measure_status
    ) VALUES (
      v_order_id, v_item->>'name', NULLIF(v_item->>'description', ''),
      v_qty, COALESCE(v_item->>'status', 'da_ordinare'),
      COALESCE((v_item->>'position')::integer, 0),
      NULLIF(v_item->>'supplier_id', '')::uuid,
      COALESCE((v_item->>'purchase_price')::numeric, 0),
      COALESCE((v_item->>'vat_rate')::numeric, 22),
      v_stock_item_id,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      COALESCE((v_item->>'standard_cost')::numeric, 0),
      COALESCE((v_item->>'is_paid')::boolean, false),
      NULLIF(v_item->>'paid_date', '')::date,
      NULLIF(v_item->>'payment_method', ''),
      COALESCE((v_item->>'deposit_amount')::numeric, 0),
      COALESCE((v_item->>'deposit_paid')::boolean, false),
      NULLIF(v_item->>'deposit_paid_date', '')::date,
      COALESCE((v_item->>'balance_amount')::numeric, 0),
      COALESCE((v_item->>'balance_paid')::boolean, false),
      NULLIF(v_item->>'balance_paid_date', '')::date,
      NULLIF(v_item->>'balance_expected_date', '')::date,
      NULLIF(v_item->>'deposit_expected_date', '')::date,
      NULLIF(v_item->>'product_code', ''),
      NULLIF(v_item->>'family_id', '')::uuid,
      NULLIF(v_item->'axis_selections', 'null'::jsonb),
      NULLIF(v_item->'misure_preventivo', 'null'::jsonb),
      NULLIF(v_item->>'measure_status', '')
    )
    RETURNING id INTO v_item_id;

    IF v_stock_item_id IS NOT NULL THEN
      UPDATE public.warehouse_stock
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_stock_item_id;

      INSERT INTO public.warehouse_movements (
        stock_item_id, order_item_id, movement_type, quantity, notes, performed_by
      ) VALUES (
        v_stock_item_id, v_item_id, 'scarico', v_qty,
        'Prelievo automatico per ordine ' ||
          COALESCE(NULLIF(TRIM(p_order_data->>'order_code'), ''), LEFT(v_order_id::text, 8)),
        v_caller_id
      );
    END IF;
  END LOOP;

  -- Installments
  IF p_installments IS NOT NULL AND jsonb_array_length(p_installments) > 0 THEN
    FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments)
    LOOP
      INSERT INTO public.order_installments (
        order_id, position, label, type, amount, is_paid, paid_date, expected_date, trigger_evento, trigger_status_id, giorni_preavviso, trigger_numero
      ) VALUES (
        v_order_id,
        COALESCE((v_inst->>'position')::integer, 0),
        COALESCE(v_inst->>'label', ''),
        COALESCE(v_inst->>'type', 'deposit'),
        COALESCE((v_inst->>'amount')::numeric, 0),
        COALESCE((v_inst->>'is_paid')::boolean, false),
        NULLIF(v_inst->>'paid_date', '')::date,
        NULLIF(v_inst->>'expected_date', '')::date,
        COALESCE(NULLIF(v_inst->>'trigger_evento', ''), 'data_fissa'),
        NULLIF(v_inst->>'trigger_status_id', '')::uuid,
        COALESCE((v_inst->>'giorni_preavviso')::integer, 7),
        NULLIF(v_inst->>'trigger_numero', '')::integer
      );
    END LOOP;
  END IF;

  -- Salesperson
  IF p_salesperson IS NOT NULL AND (p_salesperson->>'salesperson_id') IS NOT NULL THEN
    v_commission_type  := p_salesperson->>'commission_type';
    v_commission_value := COALESCE((p_salesperson->>'commission_value')::numeric, 0);
    IF v_commission_type = 'fixed' THEN
      v_commission_amount := v_commission_value;
    ELSE
      v_commission_amount := v_total_amount * (v_commission_value / 100);
    END IF;

    INSERT INTO public.order_salespeople (
      order_id, salesperson_id, commission_type, commission_value, commission_amount
    ) VALUES (
      v_order_id,
      (p_salesperson->>'salesperson_id')::uuid,
      v_commission_type, v_commission_value, v_commission_amount
    );
  END IF;

  RETURN jsonb_build_object('id', v_order_id, 'success', true);

EXCEPTION WHEN OTHERS THEN
  -- Rilancio con lo STESSO codice: un vincolo (23502, 23503, 23505) resta
  -- riconoscibile e il client lo traduce. Prima tutto diventava P0001 con il
  -- prefisso "create_order_atomic failed:", che arrivava a schermo com'era.
  RAISE EXCEPTION '%', SQLERRM USING ERRCODE = SQLSTATE;
END;
$function$;
