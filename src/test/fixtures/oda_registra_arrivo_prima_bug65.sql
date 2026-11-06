CREATE OR REPLACE FUNCTION public.oda_registra_arrivo(p_oda_id uuid, p_righe jsonb, p_ddt_number text DEFAULT NULL::text, p_ddt_data date DEFAULT NULL::date, p_warehouse_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_ddt_file_url text DEFAULT NULL::text, p_ddt_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ddt_ricezione_id uuid, righe_registrate integer, quantita_totale numeric, oda_completo boolean, errori jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_supplier_id uuid;
  v_oda_number text;
  v_order_id uuid;      -- commessa dell'ordine
  v_ticket_id uuid;     -- ticket di assistenza dell'ordine
  v_riga jsonb;
  v_item_id uuid; v_qty numeric; v_stock_item_id uuid;
  v_order_item_id uuid; -- riga di commessa della riga d'ordine
  v_ordered numeric; v_already numeric; v_residual numeric;
  v_righe int := 0; v_tot numeric := 0; v_errori jsonb := '[]'::jsonb;
  v_mancante numeric; v_completo boolean; v_testo_mancante text;
  v_ddt_id uuid; v_numero text; v_data date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized: no auth.uid()'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Nessuna azienda attiva'; END IF;
  IF public.utente_bloccato() OR public.utente_e_cliente_esterno() THEN
    RAISE EXCEPTION 'Non puoi registrare arrivi merce' USING errcode = '42501';
  END IF;

  SELECT supplier_id, oda_number, order_id, ticket_id
    INTO v_supplier_id, v_oda_number, v_order_id, v_ticket_id
    FROM public.purchase_orders
   WHERE id = p_oda_id AND company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine non valido per questa azienda'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = p_oda_id AND status = 'annullato') THEN
    RAISE EXCEPTION 'Ordine annullato: non si registrano arrivi';
  END IF;

  -- ── Testata della bolla ────────────────────────────────────────────────────
  -- `numero_ddt` è NOT NULL e capita spessissimo che la bolla non ce l'abbia:
  -- meglio «S/N + data» che bloccare l'arrivo (ripiego di …0004, da tenere).
  v_data := coalesce(p_ddt_data, CURRENT_DATE);
  v_numero := NULLIF(btrim(coalesce(p_ddt_number, '')), '');
  IF v_numero IS NULL THEN
    v_numero := 'S/N ' || to_char(v_data, 'DD/MM/YYYY');
  END IF;

  IF p_ddt_id IS NOT NULL THEN
    -- la bolla c'è già (scritta dal modulo DDT): le righe si agganciano a lei
    SELECT id, numero_ddt INTO v_ddt_id, v_numero FROM public.ddt_ricezione
     WHERE id = p_ddt_id AND purchase_order_id = p_oda_id AND company_id = v_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bolla non valida per questo ordine'; END IF;
  ELSE
  INSERT INTO public.ddt_ricezione (
    company_id, purchase_order_id, numero_ddt, data_ricezione, stato,
    note, source, warehouse_id, ddt_file_url, created_by, quantita_ricevuta
  ) VALUES (
    v_company_id, p_oda_id, v_numero, v_data, 'ricevuto',
    NULLIF(btrim(coalesce(p_note, '')), ''), 'manual', p_warehouse_id,
    NULLIF(btrim(coalesce(p_ddt_file_url, '')), ''), auth.uid(), 0
  )
  RETURNING id INTO v_ddt_id;
  END IF;

  -- ── Righe ──────────────────────────────────────────────────────────────────
  FOR v_riga IN SELECT * FROM jsonb_array_elements(p_righe)
  LOOP
    BEGIN
      v_item_id := NULLIF(v_riga->>'item_id', '')::uuid;
      v_qty := coalesce((v_riga->>'quantity')::numeric, 0);
      v_stock_item_id := NULLIF(v_riga->>'stock_item_id', '')::uuid;

      IF v_item_id IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

      SELECT quantity, coalesce(quantity_received, 0), order_item_id
        INTO v_ordered, v_already, v_order_item_id
        FROM public.purchase_order_items
       WHERE id = v_item_id AND purchase_order_id = p_oda_id;
      IF NOT FOUND THEN
        v_errori := v_errori || jsonb_build_object('item_id', v_item_id, 'errore', 'riga_non_trovata');
        CONTINUE;
      END IF;

      -- Mai oltre il residuo: se il fornitore manda di più, si ferma all'ordinato.
      v_residual := coalesce(v_ordered, 0) - v_already;
      IF v_residual <= 0 THEN
        v_errori := v_errori || jsonb_build_object('item_id', v_item_id, 'errore', 'gia_completa');
        CONTINUE;
      END IF;
      IF v_qty > v_residual THEN v_qty := v_residual; END IF;

      UPDATE public.purchase_order_items
         SET quantity_received = coalesce(quantity_received, 0) + v_qty,
             stock_item_id = coalesce(v_stock_item_id, stock_item_id),
             received_date = v_data
       WHERE id = v_item_id AND purchase_order_id = p_oda_id;

      -- Carico di magazzino SOLO se la riga è stata abbinata a un articolo.
      -- Il movimento porta con sé la commessa: così dal magazzino si sa per
      -- quale cantiere è entrata la merce, non solo che è entrata.
      IF v_stock_item_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.warehouse_stock WHERE id = v_stock_item_id AND company_id = v_company_id) THEN
          INSERT INTO public.warehouse_movements(
            stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id,
            order_id, order_item_id
          ) VALUES (
            v_stock_item_id, 'carico', v_qty::integer,
            'Arrivo merce ordine ' || coalesce(v_oda_number, '') ||
              ' · bolla ' || v_numero,
            auth.uid(), v_company_id, coalesce((select ws2.warehouse_id from public.warehouse_stock ws2 where ws2.id = v_stock_item_id), p_warehouse_id),
            v_order_id, v_order_item_id
          );
          UPDATE public.warehouse_stock
             SET quantity = quantity + v_qty,
                 supplier_id = coalesce(supplier_id, v_supplier_id),
                 warehouse_id = coalesce(warehouse_id, p_warehouse_id),
                 last_delivery_date = CURRENT_DATE,
                 updated_at = now()
           WHERE id = v_stock_item_id;
        ELSE
          v_errori := v_errori || jsonb_build_object('stock_item_id', v_stock_item_id, 'errore', 'articolo_non_trovato');
        END IF;
      END IF;

      v_righe := v_righe + 1;
      v_tot := v_tot + v_qty;
    EXCEPTION WHEN OTHERS THEN
      v_errori := v_errori || jsonb_build_object('item_id', v_item_id, 'errore', SQLERRM);
    END;
  END LOOP;

  -- ── L'ordine avanza da solo ────────────────────────────────────────────────
  SELECT coalesce(sum(GREATEST(quantity - coalesce(quantity_received, 0), 0)), 0)
    INTO v_mancante
    FROM public.purchase_order_items
   WHERE purchase_order_id = p_oda_id;
  v_completo := v_mancante <= 0;

  UPDATE public.purchase_orders
     SET status = CASE WHEN v_completo THEN 'ricevuto' ELSE 'parziale' END,
         actual_delivery_date = CASE WHEN v_completo THEN v_data ELSE actual_delivery_date END,
         updated_at = now()
   WHERE id = p_oda_id AND company_id = v_company_id
     AND status NOT IN ('annullato')
     -- mai indietro: un ordine ricevuto resta ricevuto
     AND (v_completo OR status <> 'ricevuto')
     -- niente è entrato: l'ordine non si muove
     AND (v_righe > 0 OR v_completo);

  UPDATE public.ddt_ricezione
     SET quantita_ricevuta = coalesce(quantita_ricevuta, 0) + v_tot,
         stato = CASE WHEN stato IN ('verificato', 'non_conforme') THEN stato WHEN v_completo THEN 'ricevuto' ELSE 'parziale' END
   WHERE id = v_ddt_id;

  -- ── Il ticket di assistenza si aggiorna da solo ────────────────────────────
  -- Chi guarda il ticket vede lo stato della merce senza aprire l'ordine, e il
  -- riquadro rosso «cosa manca» si compila con le righe rimaste scoperte.
  IF v_ticket_id IS NOT NULL AND v_righe > 0 THEN
    IF NOT v_completo THEN
      SELECT string_agg(
               coalesce(NULLIF(btrim(i.description), ''), i.sku, 'Riga senza descrizione')
               || ': mancano '
               -- FM toglie gli zeri finali ma lascia il punto: «mancano 45.» no.
               || trim(TRAILING '.' FROM trim(to_char(i.quantity - coalesce(i.quantity_received, 0), 'FM999999990.999')))
               || coalesce(' ' || NULLIF(btrim(i.unit_of_measure), ''), ''),
               E'\n' ORDER BY i.sort_order NULLS LAST, i.description)
        INTO v_testo_mancante
        FROM public.purchase_order_items i
       WHERE i.purchase_order_id = p_oda_id
         AND i.quantity - coalesce(i.quantity_received, 0) > 0;
    END IF;

    UPDATE public.tickets
       SET merce_stato = CASE WHEN v_completo THEN 'arrivata' ELSE 'arrivata_parziale' END,
           merce_mancante = CASE WHEN v_completo THEN NULL ELSE v_testo_mancante END,
           updated_at = now()
     WHERE id = v_ticket_id AND company_id = v_company_id;
  END IF;

  RETURN QUERY SELECT v_ddt_id, v_righe, v_tot, v_completo, v_errori;
END
$function$
