-- ─────────────────────────────────────────────────────────────────────────────
-- FIX migration precedente (20260520220000) + sistema reservation corretto
-- ─────────────────────────────────────────────────────────────────────────────
--
-- BUG nel commit precedente:
-- I trigger 20260520220000 usavano status='prenotato' come marker per la
-- reservation. Ma il tipo applicativo OrderItemStatus contiene solo:
--   'da_ordinare' | 'ordinato' | 'in_produzione' | 'in_arrivo'
--   | 'in_magazzino' | 'installato'
-- Il valore 'prenotato' NON viene mai settato dall'app -> i trigger erano
-- codice morto.
--
-- ANCHE il trigger esistente del 2026-03-11 (trigger_update_stock_reservation
-- + update_reservation_on_status_change su UPDATE) usava 'prenotato'. Stesso
-- bug, mai notato perche nessuna riga lo settava mai.
--
-- CORREZIONE: usare fulfillment_status (colonna separata) come marker. Valori:
--   not_started | received | shipped | delivered | installed
-- Logica corretta:
--   fulfillment_status='received' -> +reserve (merce in magazzino, riservata)
--   fulfillment_status='shipped'/'delivered'/'installed' -> -reserve (fuori)
--
-- INOLTRE: create_shipment_atomic deve decrementare quantity_reserved quando
-- scarica verso ordine. Senza, dopo una spedizione il counter resta gonfio
-- e quantity_available risulta sotto-stimata (doppio scalo).
-- Lo facciamo qui via update del fulfillment_status dell'order_item da
-- 'received' a 'shipped' dentro la transazione (cosi i trigger fanno
-- partire automaticamente il -reserve).
--
-- Strategia safe: NON tocchiamo i trigger preesistenti (potrebbero attivarsi
-- se qualche codice futuro setta 'prenotato'). Aggiungiamo trigger NUOVI su
-- fulfillment_status. Drop dei trigger del commit precedente sbagliato.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1) DROP trigger del commit precedente (codice morto) ────────────────
DROP TRIGGER IF EXISTS reserve_stock_on_insert_order_item ON public.order_items;
DROP TRIGGER IF EXISTS release_stock_on_delete_order_item ON public.order_items;
DROP FUNCTION IF EXISTS public.trigger_reserve_on_insert_order_item();
DROP FUNCTION IF EXISTS public.trigger_release_on_delete_order_item();

-- ─── 2) Funzione unica fulfillment_status → reserve delta ────────────────
-- Calcola se uno status indica "merce in magazzino riservata" (TRUE) o no.
CREATE OR REPLACE FUNCTION public.fulfillment_status_holds_reserve(p_status text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_status = 'received';
$$;

-- ─── 3) Trigger AFTER INSERT: se nasce gia 'received' -> +reserve ────────
CREATE OR REPLACE FUNCTION public.trg_oi_reserve_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.stock_item_id IS NOT NULL
     AND public.fulfillment_status_holds_reserve(NEW.fulfillment_status)
     AND COALESCE(NEW.quantity, 0) > 0
  THEN
    UPDATE public.warehouse_stock
       SET quantity_reserved = quantity_reserved + NEW.quantity,
           updated_at = NOW()
     WHERE id = NEW.stock_item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oi_reserve_on_insert ON public.order_items;
CREATE TRIGGER oi_reserve_on_insert
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_oi_reserve_on_insert();

-- ─── 4) Trigger AFTER UPDATE: gestisce transizioni held → not held ───────
-- Esempi:
--   not_started -> received  : +reserve
--   received    -> shipped   : -reserve  (la merce esce, no piu blocco)
--   received    -> not_started: -reserve (annullato)
--   stock_item_id cambiato mentre 'received': sposta reserve tra stock items
CREATE OR REPLACE FUNCTION public.trg_oi_reserve_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_held boolean := public.fulfillment_status_holds_reserve(OLD.fulfillment_status);
  v_new_held boolean := public.fulfillment_status_holds_reserve(NEW.fulfillment_status);
BEGIN
  -- Caso semplice: sia OLD che NEW NON held -> niente da fare
  IF NOT v_old_held AND NOT v_new_held THEN
    RETURN NEW;
  END IF;

  -- Rilascia reserve su OLD se OLD era held e ha cambiato stato/item/quantita
  IF v_old_held
     AND OLD.stock_item_id IS NOT NULL
     AND COALESCE(OLD.quantity, 0) > 0
     AND (
       NOT v_new_held
       OR OLD.stock_item_id IS DISTINCT FROM NEW.stock_item_id
       OR OLD.quantity IS DISTINCT FROM NEW.quantity
     )
  THEN
    UPDATE public.warehouse_stock
       SET quantity_reserved = GREATEST(0, quantity_reserved - OLD.quantity),
           updated_at = NOW()
     WHERE id = OLD.stock_item_id;
  END IF;

  -- Aggiungi reserve su NEW se NEW e held e ha cambiato stato/item/quantita
  IF v_new_held
     AND NEW.stock_item_id IS NOT NULL
     AND COALESCE(NEW.quantity, 0) > 0
     AND (
       NOT v_old_held
       OR OLD.stock_item_id IS DISTINCT FROM NEW.stock_item_id
       OR OLD.quantity IS DISTINCT FROM NEW.quantity
     )
  THEN
    UPDATE public.warehouse_stock
       SET quantity_reserved = quantity_reserved + NEW.quantity,
           updated_at = NOW()
     WHERE id = NEW.stock_item_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oi_reserve_on_update ON public.order_items;
CREATE TRIGGER oi_reserve_on_update
  AFTER UPDATE OF fulfillment_status, stock_item_id, quantity ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_oi_reserve_on_update();

-- ─── 5) Trigger AFTER DELETE: se row held -> rilascia ────────────────────
CREATE OR REPLACE FUNCTION public.trg_oi_reserve_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.stock_item_id IS NOT NULL
     AND public.fulfillment_status_holds_reserve(OLD.fulfillment_status)
     AND COALESCE(OLD.quantity, 0) > 0
  THEN
    UPDATE public.warehouse_stock
       SET quantity_reserved = GREATEST(0, quantity_reserved - OLD.quantity),
           updated_at = NOW()
     WHERE id = OLD.stock_item_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS oi_reserve_on_delete ON public.order_items;
CREATE TRIGGER oi_reserve_on_delete
  AFTER DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_oi_reserve_on_delete();

-- ─── 6) Backfill: ricalcola quantity_reserved da zero per stock_items
-- che hanno order_items 'received'. Una tantum, idempotente. ──────────────
-- Skip se la company non ha order_items o se le tabelle sono vuote.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.warehouse_stock;
  IF v_count = 0 THEN
    RAISE NOTICE 'warehouse_stock vuoto, skip backfill';
    RETURN;
  END IF;

  -- Reset + ricalcolo dai dati attuali (somma quantity di order_items
  -- con fulfillment_status='received' raggruppato per stock_item_id).
  WITH expected AS (
    SELECT stock_item_id, COALESCE(SUM(quantity), 0)::int AS reserved
      FROM public.order_items
     WHERE stock_item_id IS NOT NULL
       AND fulfillment_status = 'received'
     GROUP BY stock_item_id
  )
  UPDATE public.warehouse_stock ws
     SET quantity_reserved = COALESCE(e.reserved, 0),
         updated_at = NOW()
    FROM expected e
   WHERE ws.id = e.stock_item_id
     AND ws.quantity_reserved IS DISTINCT FROM COALESCE(e.reserved, 0);

  -- Stock items SENZA order_items received: quantity_reserved deve essere 0
  UPDATE public.warehouse_stock ws
     SET quantity_reserved = 0,
         updated_at = NOW()
   WHERE quantity_reserved > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.order_items oi
        WHERE oi.stock_item_id = ws.id
          AND oi.fulfillment_status = 'received'
     );

  RAISE NOTICE 'Backfill quantity_reserved completato';
END;
$$;

-- ─── 7) Aggiorna create_shipment_atomic per settare fulfillment_status
-- 'shipped' sull'order_item quando viene scaricato. Il trigger UPDATE
-- sopra rilascera la reserve automaticamente. ────────────────────────────
-- NOTA: NON tocchiamo la signature dell'RPC (compat con caller esistenti).
-- Aggiungiamo solo l'UPDATE su order_items dentro la transazione.

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

      -- NEW v8.6.103: aggiorna order_items.fulfillment_status -> 'shipped'
      -- per le righe ordine matchate. Il trigger oi_reserve_on_update
      -- decrementera automaticamente quantity_reserved.
      -- Match per stock_item_id + ordine (granularita item, non riga
      -- specifica: se l'ordine ha piu righe stesso stock_item resterebbe
      -- ambiguo; in tal caso il primo trovato vince - acceptable trade-off
      -- per ora dato che la UI gia previene duplicati di stock_item per ordine).
      IF p_order_id IS NOT NULL THEN
        UPDATE public.order_items
           SET fulfillment_status = 'shipped',
               updated_at = now()
         WHERE order_id = p_order_id
           AND stock_item_id = v_item_id
           AND fulfillment_status IN ('received', 'not_started');
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

  IF p_order_id IS NOT NULL THEN
    v_cliente_snapshot := jsonb_build_object(
      'customer_id', v_order.customer_id,
      'ragione_sociale', COALESCE(v_order.client_company, v_order.client_name, 'Cliente'),
      'indirizzo', COALESCE(v_order.client_address, ''),
      'telefono', COALESCE(v_order.client_phone, ''),
      'email', COALESCE(v_order.client_email, '')
    );
  ELSE
    v_cliente_snapshot := jsonb_build_object(
      'ragione_sociale', 'Da definire',
      'indirizzo', '', 'telefono', '', 'email', ''
    );
  END IF;

  v_vettore_jsonb := COALESCE(p_ddt_extra->'vettore', NULL);
  v_indirizzo_jsonb := COALESCE(p_ddt_extra->'destinazione_indirizzo', NULL);
  v_vettore_str := NULLIF(p_ddt_extra->>'vettore', '');
  v_indirizzo_str := NULLIF(p_ddt_extra->>'destinazione_indirizzo', '');

  INSERT INTO public.documenti(
    company_id, tipo_documento, numero_documento, progressivo, anno,
    data_emissione, stato, cliente_snapshot, fornitore_snapshot,
    indirizzo_destinazione, vettore_snapshot,
    righe, totali, ordine_id, created_by
  ) VALUES (
    v_company_id, 'ddt', v_numero_ddt, v_progressivo, v_year,
    CURRENT_DATE, 'bozza', v_cliente_snapshot, NULL,
    COALESCE(v_indirizzo_jsonb,
             CASE WHEN v_indirizzo_str IS NOT NULL
                  THEN jsonb_build_object('descrizione', v_indirizzo_str)
                  ELSE NULL END),
    COALESCE(v_vettore_jsonb,
             CASE WHEN v_vettore_str IS NOT NULL
                  THEN jsonb_build_object('descrizione', v_vettore_str)
                  ELSE NULL END),
    v_righe,
    jsonb_build_object(
      'totale_imponibile', 0, 'totale_iva', 0, 'totale_documento', 0
    ),
    p_order_id, auth.uid()
  ) RETURNING id INTO v_documento_id;

  RETURN QUERY SELECT v_documento_id, v_numero_ddt, v_movements, v_units, v_errors;
END;
$function$;

-- v8.6.103: aggiunto UPDATE order_items.fulfillment_status -> 'shipped' dopo
-- scarico, cosi il trigger oi_reserve_on_update decrementa quantity_reserved
-- automaticamente. Niente piu doppio scalo.
