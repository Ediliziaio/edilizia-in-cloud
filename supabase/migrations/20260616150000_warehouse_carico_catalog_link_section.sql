-- Fase A — Fondamenta entrata merce:
-- 1) legame magazzino ↔ listino (article_families) per ereditare codice/prezzi al primo carico
-- 2) RPC batch_carico_from_scans estesa con section_id per riga (additivo).
--    NB: il prezzo d'acquisto per riga era già supportato (unit_price → unit_cost / purchase_price).

ALTER TABLE public.warehouse_stock
  ADD COLUMN IF NOT EXISTS article_family_id uuid REFERENCES public.article_families(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_article_family ON public.warehouse_stock(article_family_id);

CREATE OR REPLACE FUNCTION public.batch_carico_from_scans(p_warehouse_id uuid, p_supplier_id uuid, p_scans jsonb, p_ddt_ricezione_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(created_movements integer, created_units integer, updated_items integer, errors jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID := public.get_my_company_id();
  v_scan JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_section_id UUID;
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
      v_section_id := NULLIF(v_scan->>'section_id', '')::UUID;
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
             section_id = COALESCE(v_section_id, section_id),
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
              warehouse_id, section_id, supplier_id, purchase_price,
              purchase_ddt_ricezione_id, purchase_date, created_by
            ) VALUES (
              v_company_id, v_item_id, v_serial, 'available',
              p_warehouse_id, v_section_id, p_supplier_id, v_price,
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
$function$;
