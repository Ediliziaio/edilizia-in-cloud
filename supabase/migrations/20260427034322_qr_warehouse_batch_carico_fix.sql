-- ============================================================
-- FIX batch_carico_from_scans — ON CONFLICT su partial index
-- ============================================================
-- Bug rilevato durante test E2E:
--   ERROR: there is no unique or exclusion constraint matching
--          the ON CONFLICT specification
--
-- Causa: l'INSERT in warehouse_scan_events usava
--   ON CONFLICT (offline_client_uuid) DO NOTHING
-- ma l'indice unique idx_scan_events_offline_uuid è partial
--   (WHERE offline_client_uuid IS NOT NULL).
-- Postgres non può inferire un constraint da un partial unique
-- index per ON CONFLICT — runtime error.
--
-- Effetto collaterale: il subblock EXCEPTION cattura l'errore e
-- fa rollback delle INSERT precedenti (movements, UPDATE giacenza).
-- Risultato: created_movements=1 nei counter ma giacenza invariata
-- e movimento mai persistito.
--
-- Fix: pre-check con IF NOT EXISTS invece di ON CONFLICT.
-- Idempotency offline preservata.
-- ============================================================

BEGIN;

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
  v_existing_event INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user';
  END IF;

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

      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes,
        performed_by, company_id, warehouse_id, unit_cost
      ) VALUES (
        v_item_id, 'carico', v_qty::INTEGER,
        COALESCE(p_notes, 'Carico batch QR'),
        auth.uid(), v_company_id, p_warehouse_id, v_price
      );
      v_movements := v_movements + 1;

      UPDATE public.warehouse_stock
         SET quantity = quantity + v_qty,
             warehouse_id = COALESCE(warehouse_id, p_warehouse_id),
             supplier_id = COALESCE(supplier_id, p_supplier_id),
             last_delivery_date = CURRENT_DATE,
             updated_at = now()
       WHERE id = v_item_id;
      v_items := v_items + 1;

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

      -- ─── Audit scan event con idempotency offline ─────────────
      -- Pre-check IF NOT EXISTS invece di ON CONFLICT: l'indice
      -- idx_scan_events_offline_uuid è partial (WHERE NOT NULL) e
      -- Postgres non lo accetta come target per ON CONFLICT.
      IF v_offline_uuid IS NULL THEN
        INSERT INTO public.warehouse_scan_events(
          company_id, user_id, warehouse_id, scanned_code, scan_format,
          scan_type, resolved_stock_item_id, resolution_status,
          supplier_id, quantity, offline_client_uuid, synced_from_offline
        ) VALUES (
          v_company_id, auth.uid(), p_warehouse_id,
          COALESCE(v_scan->>'raw_code', ''),
          NULLIF(v_scan->>'scan_format', ''),
          'carico', v_item_id, 'matched',
          p_supplier_id, v_qty, NULL, false
        );
      ELSE
        SELECT 1 INTO v_existing_event
          FROM public.warehouse_scan_events
         WHERE offline_client_uuid = v_offline_uuid
         LIMIT 1;
        IF NOT FOUND THEN
          INSERT INTO public.warehouse_scan_events(
            company_id, user_id, warehouse_id, scanned_code, scan_format,
            scan_type, resolved_stock_item_id, resolution_status,
            supplier_id, quantity, offline_client_uuid, synced_from_offline
          ) VALUES (
            v_company_id, auth.uid(), p_warehouse_id,
            COALESCE(v_scan->>'raw_code', ''),
            NULLIF(v_scan->>'scan_format', ''),
            'carico', v_item_id, 'matched',
            p_supplier_id, v_qty, v_offline_uuid, true
          );
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('scan', v_scan, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_movements, v_units, v_items, v_errors;
END;
$$;

COMMIT;
