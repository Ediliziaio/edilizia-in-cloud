-- L'arrivo merce parla con la commessa e con il ticket (07/09/2026).
--
-- `oda_registra_arrivo` (migration …0003) registrava bene l'arrivo sull'ordine,
-- ma si fermava lì: il carico di magazzino non diceva per quale cantiere era
-- entrata la merce, e il ticket di assistenza collegato all'ordine continuava a
-- dover essere aggiornato a mano da chi era in ufficio.
--
-- I collegamenti esistevano già tutti nel database:
--   purchase_orders.order_id   → la commessa (84 ordini su 86 ce l'hanno)
--   purchase_orders.ticket_id  → il ticket, scritto quando l'ODA nasce dalla
--                                card «Serve della merce» del ticket
--   purchase_order_items.order_item_id → la riga di commessa
--   warehouse_movements.order_id / order_item_id → mai valorizzati dall'arrivo
--
-- Da qui in avanti:
--   1. ogni movimento di carico porta con sé commessa e riga di commessa;
--   2. se l'ordine è legato a un ticket, il ticket si aggiorna da solo:
--      «merce arrivata» oppure «arrivata parziale» con l'elenco di ciò che
--      manca già scritto nel riquadro rosso — quello che prima Barbara
--      copiava a mano dalla bolla.
--
-- Applicata sul live via Management API, poi
-- `supabase migration repair --status applied 20280911000006 --linked`.

CREATE OR REPLACE FUNCTION public.oda_registra_arrivo(
  p_oda_id        uuid,
  p_righe         jsonb,                    -- [{ item_id, quantity, stock_item_id? }]
  p_ddt_number    text    DEFAULT NULL,
  p_ddt_data      date    DEFAULT NULL,
  p_warehouse_id  uuid    DEFAULT NULL,
  p_note          text    DEFAULT NULL,
  p_ddt_file_url  text    DEFAULT NULL
)
RETURNS TABLE (
  ddt_ricezione_id uuid,
  righe_registrate integer,
  quantita_totale  numeric,
  oda_completo     boolean,
  errori           jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

  SELECT supplier_id, oda_number, order_id, ticket_id
    INTO v_supplier_id, v_oda_number, v_order_id, v_ticket_id
    FROM public.purchase_orders
   WHERE id = p_oda_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine non valido per questa azienda'; END IF;

  -- ── Testata della bolla ────────────────────────────────────────────────────
  -- `numero_ddt` è NOT NULL e capita spessissimo che la bolla non ce l'abbia:
  -- meglio «S/N + data» che bloccare l'arrivo (ripiego di …0004, da tenere).
  v_data := coalesce(p_ddt_data, CURRENT_DATE);
  v_numero := NULLIF(btrim(coalesce(p_ddt_number, '')), '');
  IF v_numero IS NULL THEN
    v_numero := 'S/N ' || to_char(v_data, 'DD/MM/YYYY');
  END IF;

  INSERT INTO public.ddt_ricezione (
    company_id, purchase_order_id, numero_ddt, data_ricezione, stato,
    note, source, warehouse_id, ddt_file_url, created_by, quantita_ricevuta
  ) VALUES (
    v_company_id, p_oda_id, v_numero, v_data, 'ricevuto',
    NULLIF(btrim(coalesce(p_note, '')), ''), 'manual', p_warehouse_id,
    NULLIF(btrim(coalesce(p_ddt_file_url, '')), ''), auth.uid(), 0
  )
  RETURNING id INTO v_ddt_id;

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
             received_date = v_data
       WHERE id = v_item_id AND purchase_order_id = p_oda_id;

      -- Carico di magazzino SOLO se la riga è stata abbinata a un articolo.
      -- Il movimento porta con sé la commessa: così dal magazzino si sa per
      -- quale cantiere è entrata la merce, non solo che è entrata.
      IF v_stock_item_id IS NOT NULL AND p_warehouse_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.warehouse_stock WHERE id = v_stock_item_id AND company_id = v_company_id) THEN
          INSERT INTO public.warehouse_movements(
            stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id,
            order_id, order_item_id
          ) VALUES (
            v_stock_item_id, 'carico', v_qty::integer,
            'Arrivo merce ordine ' || coalesce(v_oda_number, '') ||
              ' · bolla ' || v_numero,
            auth.uid(), v_company_id, p_warehouse_id,
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
     AND status NOT IN ('annullato');

  UPDATE public.ddt_ricezione
     SET quantita_ricevuta = v_tot,
         stato = CASE WHEN v_completo THEN 'ricevuto' ELSE 'parziale' END
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
$function$;

REVOKE ALL ON FUNCTION public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text) IS
  'Registra un arrivo merce da ordine a fornitore con le quantità scritte a mano: aggiorna le righe (mai oltre il residuo), crea la bolla, carica il magazzino attribuendo il movimento alla commessa, porta l''ordine in parziale o ricevuto e aggiorna lo stato merce del ticket collegato con l''elenco di ciò che manca.';
