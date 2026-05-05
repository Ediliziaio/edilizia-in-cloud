-- ============================================================
-- QR WAREHOUSE SHIPMENT (MP3 — P1b)
-- ============================================================
-- RPC create_shipment_atomic: scarico atomico verso un cantiere via
-- batch scansioni, con generazione contestuale di un DDT in BOZZA.
--
-- Filosofia: il flusso più semplice possibile per l'utente operativo.
--   - Magazzino → "Scarico cantiere"
--   - Sceglie ordine destinazione + magazzino sorgente
--   - Scansiona articoli (BatchBarcodeScanner mode='oda_receive' adattato)
--   - Conferma → questa RPC fa TUTTO atomicamente:
--       1. Genera numero DDT progressivo (RPC genera_numero_documento_native)
--       2. INSERT documenti_fiscali tipo='ddt' in stato 'bozza' con
--          ordine_id, righe estratte dalle scansioni
--       3. Per ogni entry: warehouse_movements 'scarico' + UPDATE
--          warehouse_stock.quantity (-qty) + UPDATE stock_units (status
--          'shipped' + delivered_to_order_id + delivered_at)
--       4. INSERT warehouse_scan_events tipo='scarico'
--   - L'utente vede toast con link al DDT che può completare dalla
--     pagina fatturazione esistente (cliente, dati trasporto, ecc.)
--
-- Prerequisito: migration MP1 + MP2 applicate. Tabelle stock_units,
-- warehouse_scan_events, warehouse_stock con tracking_mode esistono.
-- ============================================================

-- Nota Supabase CLI locale:
-- alcune versioni eseguono il file come prepared statement unico. Racchiudiamo
-- funzione, grant e commento in un solo DO per evitare il classico errore
-- "cannot insert multiple commands into a prepared statement".
DO $migration$
BEGIN
  EXECUTE $function$
CREATE OR REPLACE FUNCTION public.create_shipment_atomic(
  p_order_id UUID,
  p_warehouse_id UUID,
  p_scans JSONB,
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
AS $$
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user';
  END IF;

  -- Verifica ordine appartiene alla company.
  PERFORM 1 FROM public.orders
   WHERE id = p_order_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordine non valido o non appartenente alla company';
  END IF;

  -- Verifica warehouse.
  PERFORM 1 FROM public.warehouses
   WHERE id = p_warehouse_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Magazzino non valido per la company';
  END IF;

  -- ─── Scarico atomico per ogni scansione ─────────────────────
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

      -- Movimento di scarico
      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes,
        performed_by, company_id, warehouse_id, order_id
      ) VALUES (
        v_item_id, 'scarico', v_qty::INTEGER,
        'Scarico verso ordine via DDT (in generazione)',
        auth.uid(), v_company_id, p_warehouse_id, p_order_id
      );
      v_movements := v_movements + 1;

      -- Aggiorna giacenza (decrementa) — non andare sotto zero
      UPDATE public.warehouse_stock
         SET quantity = GREATEST(0, quantity - v_qty),
             updated_at = now()
       WHERE id = v_item_id;

      -- Per articoli serializzati: aggiorna stock_units
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

      -- Audit scan event
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

      -- ─── Costruzione riga DDT ────────────────────────────────
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

  -- ─── Generazione DDT (solo se almeno una riga è stata scaricata) ─────
  IF v_line_num = 0 THEN
    -- Nessuna riga creata → ritorna senza creare il documento
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, v_movements, v_units, v_errors;
    RETURN;
  END IF;

  -- Genera numero DDT progressivo (riusa RPC esistente del sistema fatturazione)
  v_numero_ddt := public.genera_numero_documento_native(
    v_company_id, 'ddt'::TEXT, v_year
  );
  v_progressivo := COALESCE(NULLIF(split_part(v_numero_ddt, '-', array_length(string_to_array(v_numero_ddt, '-'), 1)), '')::INTEGER, 1);

  -- INSERT documento_fiscale tipo='ddt' in bozza
  INSERT INTO public.documenti_fiscali (
    company_id, tipo, numero, numero_progressivo, anno,
    data_emissione, stato, ordine_id, righe,
    note_documento,
    ddt_causale_trasporto,
    ddt_aspetto_beni,
    ddt_numero_colli,
    ddt_peso,
    ddt_mezzo_trasporto,
    ddt_porto,
    ddt_vettore,
    ddt_indirizzo_consegna
  ) VALUES (
    v_company_id, 'ddt', v_numero_ddt, v_progressivo, v_year,
    CURRENT_DATE, 'bozza', p_order_id, v_righe,
    NULLIF(p_ddt_extra->>'note_documento', ''),
    COALESCE(p_ddt_extra->>'causale_trasporto', 'Vendita'),
    NULLIF(p_ddt_extra->>'aspetto_beni', ''),
    NULLIF((p_ddt_extra->>'numero_colli')::INTEGER, 0),
    NULLIF(p_ddt_extra->>'peso', ''),
    NULLIF(p_ddt_extra->>'mezzo_trasporto', ''),
    COALESCE(p_ddt_extra->>'porto', 'Franco'),
    NULLIF(p_ddt_extra->>'vettore', ''),
    NULLIF(p_ddt_extra->>'indirizzo_consegna', '')
  )
  RETURNING id INTO v_documento_id;

  -- Aggiorna i warehouse_movements appena creati per puntare al DDT
  UPDATE public.warehouse_movements
     SET notes = 'Scarico DDT ' || v_numero_ddt
   WHERE company_id = v_company_id
     AND warehouse_id = p_warehouse_id
     AND order_id = p_order_id
     AND performed_by = auth.uid()
     AND created_at > now() - interval '5 seconds'
     AND notes = 'Scarico verso ordine via DDT (in generazione)';

  RETURN QUERY SELECT v_documento_id, v_numero_ddt, v_movements, v_units, v_errors;
END;
$$;
$function$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.create_shipment_atomic(UUID, UUID, JSONB, JSONB) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_shipment_atomic(UUID, UUID, JSONB, JSONB) TO authenticated';

  EXECUTE $comment$
COMMENT ON FUNCTION public.create_shipment_atomic IS
  'MP3 — Scarico cantiere atomico: per ogni scansione crea movimento scarico + decrementa giacenza + (se serializzato) aggiorna stock_units a status=shipped + scan_events. Genera contestualmente un DDT (documento_fiscale tipo=ddt) in stato bozza con ordine_id e righe estratte. L''utente completa cliente/dati trasporto dalla UI fatturazione esistente. Il flusso più semplice e intuitivo: una sola conferma per scarico + DDT.';
$comment$;

END;
$migration$;
