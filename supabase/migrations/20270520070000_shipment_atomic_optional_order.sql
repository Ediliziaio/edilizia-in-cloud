-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ create_shipment_atomic: rendi p_order_id OPZIONALE                ║
-- ║                                                                     ║
-- ║ Prima: il DDT era SEMPRE collegato a un ordine. Limitava casi      ║
-- ║ d'uso come resi al fornitore, spostamenti tra cantieri, consegne   ║
-- ║ spot a clienti non in anagrafica, trasferimenti interni.           ║
-- ║                                                                     ║
-- ║ Dopo: se p_order_id IS NULL → skip validazione ordine + skip       ║
-- ║ cliente_snapshot dall'ordine. Il DDT esce in bozza senza cliente   ║
-- ║ e l'utente lo completa nell'editor.                                ║
-- ║                                                                     ║
-- ║ Backwards compatible: chiamate esistenti con order_id valido       ║
-- ║ continuano a funzionare identico.                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.create_shipment_atomic(
  p_order_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_scans JSONB DEFAULT '[]'::JSONB,
  p_ddt_extra JSONB DEFAULT NULL
)
RETURNS TABLE (
  documento_id UUID,
  numero_ddt TEXT,
  created_movements INTEGER,
  updated_units INTEGER,
  errors JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_company_id UUID := public.get_my_company_id();
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_numero_ddt TEXT;
  v_progressivo INTEGER;
  v_documento_id UUID;
  v_scan JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_serials JSONB;
  v_serial TEXT;
  v_tracking TEXT;
  v_item_name TEXT;
  v_internal_code TEXT;
  v_unit_cost NUMERIC;
  v_movements INTEGER := 0;
  v_units INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
  v_righe JSONB := '[]'::JSONB;
  v_line_num INTEGER := 0;
  v_serial_list TEXT;
  v_order RECORD;
  v_cliente_snapshot JSONB;
  v_vettore_jsonb JSONB;
  v_indirizzo_jsonb JSONB;
  v_vettore_str TEXT;
  v_indirizzo_str TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user';
  END IF;
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'p_warehouse_id obbligatorio';
  END IF;

  -- ORDINE: opzionale. Se presente, carica per cliente_snapshot.
  IF p_order_id IS NOT NULL THEN
    SELECT id, customer_id, client_name, client_address, client_phone,
           client_email, client_company, indirizzo_lavori, work_address
      INTO v_order
      FROM public.orders
     WHERE id = p_order_id AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ordine non valido o non appartenente alla company';
    END IF;
  END IF;

  PERFORM 1 FROM public.warehouses
   WHERE id = p_warehouse_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Magazzino non valido per la company';
  END IF;

  FOR v_scan IN SELECT * FROM jsonb_array_elements(p_scans)
  LOOP
    BEGIN
      v_item_id := (v_scan->>'stock_item_id')::UUID;
      v_qty := COALESCE((v_scan->>'quantity')::NUMERIC, 1);
      v_serials := v_scan->'serial_numbers';

      SELECT tracking_mode, name, internal_code, unit_cost
        INTO v_tracking, v_item_name, v_internal_code, v_unit_cost
        FROM public.warehouse_stock
       WHERE id = v_item_id AND company_id = v_company_id;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object(
          'stock_item_id', v_item_id, 'error', 'item_not_found'
        );
        CONTINUE;
      END IF;

      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes,
        performed_by, company_id, warehouse_id, order_id
      ) VALUES (
        v_item_id, 'scarico', v_qty::INTEGER,
        CASE WHEN p_order_id IS NOT NULL
          THEN 'Scarico verso ordine via DDT (in generazione)'
          ELSE 'Scarico DDT senza ordine (in generazione)'
        END,
        auth.uid(), v_company_id, p_warehouse_id, p_order_id
      );
      v_movements := v_movements + 1;

      UPDATE public.warehouse_stock
         SET quantity = GREATEST(0, quantity - v_qty),
             updated_at = now()
       WHERE id = v_item_id;

      IF v_tracking = 'serialized' AND v_serials IS NOT NULL
         AND jsonb_array_length(v_serials) > 0 THEN
        FOR v_serial IN SELECT * FROM jsonb_array_elements_text(v_serials)
        LOOP
          UPDATE public.stock_units
             SET status = 'shipped',
                 delivered_to_order_id = p_order_id,
                 delivered_at = now()
           WHERE company_id = v_company_id
             AND stock_item_id = v_item_id
             AND serial_number = v_serial
             AND status = 'available';
          IF FOUND THEN
            v_units := v_units + 1;
          ELSE
            v_errors := v_errors || jsonb_build_object(
              'serial_number', v_serial,
              'error', 'serial_not_available'
            );
          END IF;
        END LOOP;
      END IF;

      INSERT INTO public.warehouse_scan_events(
        company_id, user_id, warehouse_id, scanned_code,
        scan_type, resolved_stock_item_id, resolution_status,
        order_id, quantity
      ) VALUES (
        v_company_id, auth.uid(), p_warehouse_id,
        COALESCE(v_scan->>'raw_code', ''),
        'scarico', v_item_id, 'matched',
        p_order_id, v_qty
      );

      v_line_num := v_line_num + 1;
      v_serial_list := NULL;
      IF v_tracking = 'serialized' AND v_serials IS NOT NULL
         AND jsonb_array_length(v_serials) > 0 THEN
        SELECT string_agg(s, ', ')
          INTO v_serial_list
          FROM jsonb_array_elements_text(v_serials) s;
      END IF;

      v_righe := v_righe || jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'numero_linea', v_line_num,
          'codice_articolo', COALESCE(v_internal_code, ''),
          'descrizione', v_item_name ||
            CASE WHEN v_serial_list IS NOT NULL
              THEN ' (S/N: ' || v_serial_list || ')'
              ELSE ''
            END,
          'quantita', v_qty,
          'unita_misura', 'pz',
          'prezzo_unitario', COALESCE(v_unit_cost, 0),
          'imponibile', COALESCE(v_unit_cost, 0) * v_qty,
          'aliquota_iva', '22',
          'imposta', 0,
          'totale_riga', COALESCE(v_unit_cost, 0) * v_qty
        )
      );

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('scan', v_scan, 'error', SQLERRM);
    END;
  END LOOP;

  IF v_line_num = 0 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, v_movements, v_units, v_errors;
    RETURN;
  END IF;

  v_numero_ddt := public.genera_numero_documento_native(
    v_company_id, 'ddt'::TEXT, v_year
  );
  v_progressivo := COALESCE(NULLIF(split_part(v_numero_ddt, '-', array_length(string_to_array(v_numero_ddt, '-'), 1)), '')::INTEGER, 1);

  -- cliente_snapshot solo se l'ordine è presente
  v_cliente_snapshot := NULL;
  IF p_order_id IS NOT NULL THEN
    v_cliente_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'ragione_sociale', COALESCE(v_order.client_company, v_order.client_name),
      'name', v_order.client_name,
      'address', COALESCE(v_order.client_address, v_order.work_address, v_order.indirizzo_lavori),
      'phone', v_order.client_phone,
      'email', v_order.client_email
    ));
  END IF;

  -- ddt_extra mapping (uguale a prima)
  v_vettore_jsonb := NULL;
  v_indirizzo_jsonb := NULL;
  IF p_ddt_extra IS NOT NULL THEN
    v_vettore_str := p_ddt_extra->>'vettore';
    IF v_vettore_str IS NOT NULL AND v_vettore_str != '' THEN
      BEGIN
        v_vettore_jsonb := v_vettore_str::JSONB;
        IF jsonb_typeof(v_vettore_jsonb) != 'object' THEN
          v_vettore_jsonb := jsonb_build_object('tipo', 'mittente', 'free_text', v_vettore_str);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_vettore_jsonb := jsonb_build_object('tipo', 'mittente', 'free_text', v_vettore_str);
      END;
    END IF;
    v_indirizzo_str := p_ddt_extra->>'indirizzo_consegna';
    IF v_indirizzo_str IS NOT NULL AND v_indirizzo_str != '' THEN
      BEGIN
        v_indirizzo_jsonb := v_indirizzo_str::JSONB;
        IF jsonb_typeof(v_indirizzo_jsonb) != 'object' THEN
          v_indirizzo_jsonb := jsonb_build_object('free_text', v_indirizzo_str);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_indirizzo_jsonb := jsonb_build_object('free_text', v_indirizzo_str);
      END;
    END IF;
  END IF;

  INSERT INTO public.documenti_fiscali (
    company_id, tipo, numero, numero_progressivo, anno,
    data_emissione, stato, ordine_id,
    cliente_snapshot, righe,
    ddt_causale_trasporto, ddt_aspetto_beni, ddt_numero_colli,
    ddt_peso, ddt_mezzo_trasporto, ddt_porto,
    ddt_vettore, ddt_indirizzo_consegna,
    note_documento
  ) VALUES (
    v_company_id, 'ddt', v_numero_ddt, v_progressivo, v_year,
    CURRENT_DATE, 'bozza', p_order_id,
    COALESCE(v_cliente_snapshot, '{}'::JSONB), v_righe,
    NULLIF(p_ddt_extra->>'causale_trasporto', ''),
    NULLIF(p_ddt_extra->>'aspetto_beni', ''),
    NULLIF(p_ddt_extra->>'numero_colli', '')::INTEGER,
    NULLIF(p_ddt_extra->>'peso', ''),
    NULLIF(p_ddt_extra->>'mezzo_trasporto', ''),
    NULLIF(p_ddt_extra->>'porto', ''),
    v_vettore_jsonb,
    v_indirizzo_jsonb,
    NULLIF(p_ddt_extra->>'note_documento', '')
  )
  RETURNING id INTO v_documento_id;

  UPDATE public.warehouse_movements
     SET notes = 'Scarico DDT ' || v_numero_ddt
   WHERE company_id = v_company_id
     AND warehouse_id = p_warehouse_id
     AND COALESCE(order_id::TEXT, '') = COALESCE(p_order_id::TEXT, '')
     AND performed_by = auth.uid()
     AND created_at > now() - interval '5 seconds'
     AND notes LIKE 'Scarico%(in generazione)';

  RETURN QUERY SELECT v_documento_id, v_numero_ddt, v_movements, v_units, v_errors;
END;
$function$;
