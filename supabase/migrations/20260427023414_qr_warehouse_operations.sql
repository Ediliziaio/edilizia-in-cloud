-- ============================================================
-- QR WAREHOUSE OPERATIONS (MP2 — P1a)
-- ============================================================
-- 3 nuove RPC per il flusso operativo carico/ODA:
--   1. batch_carico_from_scans(warehouse, supplier, scans[])
--      → crea movimenti carico, units serializzate, scan_events in atomico.
--   2. match_scan_to_oda(stock_item_id, supplier_id?)
--      → trova ODA pending compatibili con l'articolo scansionato.
--   3. receive_from_oda_via_scans(oda_id, warehouse, scans[])
--      → riceve merce da una ODA aggiornando quantity_received e status ODA.
--
-- Prerequisito: migration MP1 (qr_warehouse_foundation) applicata.
-- ============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════
-- RPC 1: batch_carico_from_scans
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.batch_carico_from_scans(
  p_warehouse_id UUID,
  p_supplier_id UUID,
  p_scans JSONB,
  p_ddt_ricezione_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  created_movements INTEGER,
  created_units INTEGER,
  updated_items INTEGER,
  errors JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID := public.get_my_company_id();
  v_scan JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_serials JSONB;
  v_serial TEXT;
  v_tracking TEXT;
  v_offline_uuid UUID;
  v_movements INTEGER := 0;
  v_units INTEGER := 0;
  v_items INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user';
  END IF;

  -- Verifica scoping warehouse: deve appartenere alla company corrente.
  PERFORM 1 FROM public.warehouses
   WHERE id = p_warehouse_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse non valido per la company';
  END IF;

  FOR v_scan IN SELECT * FROM jsonb_array_elements(p_scans)
  LOOP
    BEGIN
      v_item_id := (v_scan->>'stock_item_id')::UUID;
      v_qty := COALESCE((v_scan->>'quantity')::NUMERIC, 1);
      v_price := NULLIF(v_scan->>'unit_price', '')::NUMERIC;
      v_serials := v_scan->'serial_numbers';
      v_offline_uuid := NULLIF(v_scan->>'offline_client_uuid', '')::UUID;

      SELECT tracking_mode INTO v_tracking
        FROM public.warehouse_stock
       WHERE id = v_item_id AND company_id = v_company_id;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object(
          'stock_item_id', v_item_id, 'error', 'item_not_found'
        );
        CONTINUE;
      END IF;

      -- Movimento di carico
      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes,
        performed_by, company_id, warehouse_id, unit_cost
      ) VALUES (
        v_item_id, 'carico', v_qty::INTEGER,
        COALESCE(p_notes, 'Carico batch QR'),
        auth.uid(), v_company_id, p_warehouse_id, v_price
      );
      v_movements := v_movements + 1;

      -- Aggiornamento giacenza
      UPDATE public.warehouse_stock
         SET quantity = quantity + v_qty,
             warehouse_id = COALESCE(warehouse_id, p_warehouse_id),
             supplier_id = COALESCE(supplier_id, p_supplier_id),
             last_delivery_date = CURRENT_DATE,
             updated_at = now()
       WHERE id = v_item_id;
      v_items := v_items + 1;

      -- Se serializzato, crea unit per ogni seriale ricevuto
      IF v_tracking = 'serialized' AND v_serials IS NOT NULL
         AND jsonb_array_length(v_serials) > 0 THEN
        FOR v_serial IN SELECT * FROM jsonb_array_elements_text(v_serials)
        LOOP
          BEGIN
            INSERT INTO public.stock_units(
              company_id, stock_item_id, serial_number, status,
              warehouse_id, supplier_id, purchase_price,
              purchase_ddt_ricezione_id, purchase_date, created_by
            ) VALUES (
              v_company_id, v_item_id, v_serial, 'available',
              p_warehouse_id, p_supplier_id, v_price,
              p_ddt_ricezione_id, CURRENT_DATE, auth.uid()
            );
            v_units := v_units + 1;
          EXCEPTION WHEN unique_violation THEN
            v_errors := v_errors || jsonb_build_object(
              'serial_number', v_serial, 'error', 'duplicate_serial'
            );
          END;
        END LOOP;
      END IF;

      -- Audit scan event (idempotente sul client_uuid se presente)
      INSERT INTO public.warehouse_scan_events(
        company_id, user_id, warehouse_id, scanned_code, scan_format,
        scan_type, resolved_stock_item_id, resolution_status,
        supplier_id, quantity, offline_client_uuid, synced_from_offline
      ) VALUES (
        v_company_id, auth.uid(), p_warehouse_id,
        COALESCE(v_scan->>'raw_code', ''),
        NULLIF(v_scan->>'scan_format', ''),
        'carico', v_item_id, 'matched',
        p_supplier_id, v_qty, v_offline_uuid,
        v_offline_uuid IS NOT NULL
      ) ON CONFLICT (offline_client_uuid) DO NOTHING;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('scan', v_scan, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_movements, v_units, v_items, v_errors;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_carico_from_scans(UUID, UUID, JSONB, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_carico_from_scans(UUID, UUID, JSONB, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.batch_carico_from_scans IS
  'Carico atomico in batch da N scansioni: per ogni entry crea movimento, aggiorna giacenza, (se serializzato) crea stock_units e scan_events. Errori per singola entry vengono raccolti in errors JSONB senza bloccare le altre.';

-- ═══════════════════════════════════════════════════════════
-- RPC 2: match_scan_to_oda
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.match_scan_to_oda(
  p_stock_item_id UUID,
  p_supplier_id UUID DEFAULT NULL
)
RETURNS TABLE (
  oda_id UUID,
  oda_number TEXT,
  supplier_id UUID,
  supplier_name TEXT,
  expected_delivery_date DATE,
  item_line_id UUID,
  item_description TEXT,
  quantity_ordered NUMERIC,
  quantity_received NUMERIC,
  quantity_pending NUMERIC,
  status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID := public.get_my_company_id();
  v_item_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user';
  END IF;

  SELECT name INTO v_item_name
    FROM public.warehouse_stock
   WHERE id = p_stock_item_id AND company_id = v_company_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
    SELECT
      po.id, po.oda_number,
      po.supplier_id, s.name,
      po.expected_delivery_date,
      poi.id, poi.description,
      poi.quantity, poi.quantity_received,
      (poi.quantity - poi.quantity_received) AS qty_pending,
      po.status
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    LEFT JOIN public.suppliers s ON s.id = po.supplier_id
    WHERE po.company_id = v_company_id
      AND po.status IN ('inviato', 'confermato', 'parziale')
      AND poi.quantity_received < poi.quantity
      AND poi.description ILIKE ('%' || v_item_name || '%')
      AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    ORDER BY
      CASE WHEN po.supplier_id = p_supplier_id THEN 0 ELSE 1 END,
      po.expected_delivery_date ASC NULLS LAST,
      po.created_at DESC
    LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.match_scan_to_oda(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_scan_to_oda(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.match_scan_to_oda IS
  'Cerca le ODA pending che potrebbero contenere lo stock_item scansionato. Match testuale fuzzy su poi.description ILIKE %item_name%. Sorting: stesso supplier prima, poi data consegna ASC.';

-- ═══════════════════════════════════════════════════════════
-- RPC 3: receive_from_oda_via_scans
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.receive_from_oda_via_scans(
  p_oda_id UUID,
  p_warehouse_id UUID,
  p_scans JSONB,
  p_ddt_number TEXT DEFAULT NULL,
  p_ddt_ricezione_id UUID DEFAULT NULL
)
RETURNS TABLE (
  shipped_items INTEGER,
  created_units INTEGER,
  oda_now_complete BOOLEAN,
  errors JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID := public.get_my_company_id();
  v_supplier_id UUID;
  v_oda_number TEXT;
  v_scan JSONB;
  v_oda_item_id UUID;
  v_item_id UUID;
  v_qty NUMERIC;
  v_serials JSONB;
  v_serial TEXT;
  v_tracking TEXT;
  v_shipped INTEGER := 0;
  v_units INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
  v_all_received BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user';
  END IF;

  SELECT supplier_id, oda_number INTO v_supplier_id, v_oda_number
    FROM public.purchase_orders
   WHERE id = p_oda_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ODA non valida o non appartenente alla company';
  END IF;

  FOR v_scan IN SELECT * FROM jsonb_array_elements(p_scans)
  LOOP
    BEGIN
      v_oda_item_id := NULLIF(v_scan->>'oda_item_id', '')::UUID;
      v_item_id := (v_scan->>'stock_item_id')::UUID;
      v_qty := COALESCE((v_scan->>'quantity')::NUMERIC, 1);
      v_serials := v_scan->'serial_numbers';

      SELECT tracking_mode INTO v_tracking
        FROM public.warehouse_stock
       WHERE id = v_item_id AND company_id = v_company_id;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object(
          'stock_item_id', v_item_id, 'error', 'item_not_found'
        );
        CONTINUE;
      END IF;

      -- Aggiorna quantity_received della riga ODA (se collegata)
      IF v_oda_item_id IS NOT NULL THEN
        UPDATE public.purchase_order_items
           SET quantity_received = quantity_received + v_qty,
               received_date = CURRENT_DATE
         WHERE id = v_oda_item_id AND purchase_order_id = p_oda_id;
      END IF;

      -- Movimento carico
      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes,
        performed_by, company_id, warehouse_id
      ) VALUES (
        v_item_id, 'carico', v_qty::INTEGER,
        'Carico da ODA ' || COALESCE(v_oda_number, ''),
        auth.uid(), v_company_id, p_warehouse_id
      );

      -- Aggiornamento giacenza
      UPDATE public.warehouse_stock
         SET quantity = quantity + v_qty,
             supplier_id = COALESCE(supplier_id, v_supplier_id),
             warehouse_id = COALESCE(warehouse_id, p_warehouse_id),
             last_delivery_date = CURRENT_DATE,
             updated_at = now()
       WHERE id = v_item_id;

      -- Stock_units per articoli serializzati
      IF v_tracking = 'serialized' AND v_serials IS NOT NULL
         AND jsonb_array_length(v_serials) > 0 THEN
        FOR v_serial IN SELECT * FROM jsonb_array_elements_text(v_serials)
        LOOP
          BEGIN
            INSERT INTO public.stock_units(
              company_id, stock_item_id, serial_number, status,
              warehouse_id, supplier_id,
              purchase_ddt_ricezione_id, purchase_date, created_by
            ) VALUES (
              v_company_id, v_item_id, v_serial, 'available',
              p_warehouse_id, v_supplier_id,
              p_ddt_ricezione_id, CURRENT_DATE, auth.uid()
            );
            v_units := v_units + 1;
          EXCEPTION WHEN unique_violation THEN
            v_errors := v_errors || jsonb_build_object(
              'serial_number', v_serial, 'error', 'duplicate'
            );
          END;
        END LOOP;
      END IF;

      -- Audit scan event
      INSERT INTO public.warehouse_scan_events(
        company_id, user_id, warehouse_id, scanned_code,
        scan_type, resolved_stock_item_id, resolution_status,
        supplier_id, purchase_order_id, quantity
      ) VALUES (
        v_company_id, auth.uid(), p_warehouse_id,
        COALESCE(v_scan->>'raw_code', ''),
        'oda_receive', v_item_id, 'matched',
        v_supplier_id, p_oda_id, v_qty
      );

      v_shipped := v_shipped + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('scan', v_scan, 'error', SQLERRM);
    END;
  END LOOP;

  -- Check completamento ODA: nessuna riga con quantity_received < quantity
  SELECT NOT EXISTS (
    SELECT 1 FROM public.purchase_order_items
     WHERE purchase_order_id = p_oda_id AND quantity_received < quantity
  ) INTO v_all_received;

  IF v_all_received THEN
    UPDATE public.purchase_orders
       SET status = 'ricevuto',
           actual_delivery_date = CURRENT_DATE,
           updated_at = now()
     WHERE id = p_oda_id;
  ELSE
    UPDATE public.purchase_orders
       SET status = 'parziale', updated_at = now()
     WHERE id = p_oda_id AND status IN ('inviato', 'confermato');
  END IF;

  RETURN QUERY SELECT v_shipped, v_units, v_all_received, v_errors;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_from_oda_via_scans(UUID, UUID, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_from_oda_via_scans(UUID, UUID, JSONB, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.receive_from_oda_via_scans IS
  'Ricevi merce da una ODA via batch scansioni. Aggiorna purchase_order_items.quantity_received, crea movimenti, units, scan_events. Aggiorna automaticamente status ODA a "ricevuto" o "parziale".';

COMMIT;
