CREATE OR REPLACE FUNCTION public.register_warehouse_uscita(
  p_warehouse_id uuid, p_destinatario jsonb, p_scans jsonb,
  p_vettore jsonb DEFAULT NULL::jsonb, p_note text DEFAULT NULL::text)
 RETURNS TABLE(uscita_id uuid, numero text, created_movements integer, updated_units integer, errors jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_seq integer; v_numero text; v_uscita_id uuid;
  v_tipo text := COALESCE(p_destinatario->>'tipo', 'libero');
  v_customer_id uuid := NULLIF(p_destinatario->>'customer_id','')::uuid;
  v_order_id uuid := NULLIF(p_destinatario->>'order_id','')::uuid;
  v_scan jsonb; v_item_id uuid; v_qty numeric; v_serials jsonb; v_serial text;
  v_tracking text; v_item_name text; v_internal_code text; v_unit_cost numeric;
  v_current_qty numeric;
  v_movements integer := 0; v_units integer := 0; v_errors jsonb := '[]'::jsonb;
  v_righe jsonb := '[]'::jsonb; v_line integer := 0; v_serial_list text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company context'; END IF;
  PERFORM 1 FROM public.warehouses WHERE id = p_warehouse_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Magazzino non valido per la company'; END IF;

  SELECT COALESCE(MAX(numero_seq),0)+1 INTO v_seq
    FROM public.warehouse_uscite WHERE company_id = v_company_id AND anno = v_year;
  v_numero := 'U-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.warehouse_uscite (
    company_id, warehouse_id, numero, numero_seq, anno, destinatario_tipo,
    customer_id, order_id, destinatario_libero, cliente_snapshot, vettore, note, stato, created_by
  ) VALUES (
    v_company_id, p_warehouse_id, v_numero, v_seq, v_year, v_tipo,
    v_customer_id, v_order_id, p_destinatario->'libero', p_destinatario->'cliente_snapshot',
    p_vettore, NULLIF(p_note,''), 'registrata', auth.uid()
  ) RETURNING id INTO v_uscita_id;

  FOR v_scan IN SELECT * FROM jsonb_array_elements(p_scans)
  LOOP
    BEGIN
      v_item_id := (v_scan->>'stock_item_id')::uuid;
      v_qty := COALESCE((v_scan->>'quantity')::numeric, 1);
      v_serials := v_scan->'serial_numbers';
      -- FOR UPDATE: il controllo qui sotto vale solo se nel frattempo nessun
      -- altro può portare via la stessa merce.
      SELECT tracking_mode, name, internal_code, unit_cost, quantity
        INTO v_tracking, v_item_name, v_internal_code, v_unit_cost, v_current_qty
        FROM public.warehouse_stock WHERE id = v_item_id AND company_id = v_company_id
        FOR UPDATE;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object('stock_item_id', v_item_id, 'error', 'item_not_found'); CONTINUE;
      END IF;

      -- GUARDIA (P1c): non registrare uno scarico maggiore della giacenza disponibile,
      -- altrimenti lo stock viene clampato a 0 ma il ledger registra la quantità piena
      -- → warehouse_stock ≠ somma movimenti. Se insufficiente, salto la riga con errore.
      IF COALESCE(v_current_qty,0) < v_qty THEN
        v_errors := v_errors || jsonb_build_object('stock_item_id', v_item_id, 'error', 'insufficient_stock',
                     'available', COALESCE(v_current_qty,0), 'requested', v_qty);
        CONTINUE;
      END IF;

      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id, order_id, uscita_id
      ) VALUES (
        v_item_id, 'scarico', v_qty::integer, 'Uscita ' || v_numero, auth.uid(), v_company_id, p_warehouse_id, v_order_id, v_uscita_id
      );
      v_movements := v_movements + 1;

      -- Niente GREATEST: con la riga bloccata la sottrazione non può andare
      -- sotto zero, e se ci andasse il CHECK deve fermare la transazione, non
      -- lasciare una giacenza finta.
      UPDATE public.warehouse_stock SET quantity = quantity - v_qty, updated_at = now() WHERE id = v_item_id;

      IF v_tracking = 'serialized' AND v_serials IS NOT NULL AND jsonb_array_length(v_serials) > 0 THEN
        FOR v_serial IN SELECT * FROM jsonb_array_elements_text(v_serials)
        LOOP
          UPDATE public.stock_units SET status = 'shipped', delivered_to_order_id = v_order_id, delivered_at = now()
           WHERE company_id = v_company_id AND stock_item_id = v_item_id AND serial_number = v_serial AND status = 'available';
          IF FOUND THEN v_units := v_units + 1;
          ELSE v_errors := v_errors || jsonb_build_object('serial_number', v_serial, 'error', 'serial_not_available'); END IF;
        END LOOP;
      END IF;

      INSERT INTO public.warehouse_scan_events(
        company_id, user_id, warehouse_id, scanned_code, scan_type, resolved_stock_item_id, resolution_status, order_id, quantity
      ) VALUES (
        v_company_id, auth.uid(), p_warehouse_id, COALESCE(v_scan->>'raw_code',''), 'scarico', v_item_id, 'matched', v_order_id, v_qty
      );

      v_line := v_line + 1; v_serial_list := NULL;
      IF v_tracking = 'serialized' AND v_serials IS NOT NULL AND jsonb_array_length(v_serials) > 0 THEN
        SELECT string_agg(s, ', ') INTO v_serial_list FROM jsonb_array_elements_text(v_serials) s;
      END IF;
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text, 'numero_linea', v_line,
        'codice_articolo', COALESCE(v_internal_code, ''),
        'descrizione', v_item_name || CASE WHEN v_serial_list IS NOT NULL THEN ' (S/N: ' || v_serial_list || ')' ELSE '' END,
        'quantita', v_qty, 'unita_misura', 'pz', 'prezzo_unitario', COALESCE(v_unit_cost, 0),
        'imponibile', COALESCE(v_unit_cost, 0) * v_qty, 'aliquota_iva', '22', 'imposta', 0,
        'totale_riga', COALESCE(v_unit_cost, 0) * v_qty
      ));
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('scan', v_scan, 'error', SQLERRM);
    END;
  END LOOP;

  UPDATE public.warehouse_uscite SET righe = v_righe, updated_at = now() WHERE id = v_uscita_id;
  RETURN QUERY SELECT v_uscita_id, v_numero, v_movements, v_units, v_errors;
END;
$function$;