-- Arrivo merce in un gesto solo (07/09/2026).
--
-- Prima, per registrare un arrivo da ordine a fornitore c'erano solo due strade:
--   1. scansione dei codici a barre (`receive_from_oda_via_scans`) — pretende il
--      barcode su ogni articolo: inutilizzabile per chi riceve maniglie e
--      guarnizioni sfuse;
--   2. il bottone «ricevuto», che chiude TUTTO in blocco e non sa dire che di 10
--      pezzi ne sono arrivati 7.
-- Risultato: su 86 ordini solo 6 avevano le righe compilate, nessuna riga aveva
-- una quantità ricevuta e in tutto il database esisteva UNA sola bolla.
--
-- Questa RPC registra l'arrivo scrivendo le quantità a mano, riga per riga, e fa
-- avanzare l'ordine da solo (parziale finché manca qualcosa). Il carico di
-- magazzino è FACOLTATIVO: `purchase_order_items` non ha un collegamento
-- all'articolo di giacenza e molte aziende (es. Ke Bei) non tengono nemmeno il
-- magazzino — a loro serve sapere cosa è arrivato dell'ordine, non la giacenza.
-- Le protezioni sono le stesse di `receive_from_oda_via_scans`: mai più del
-- residuo, mai movimenti ciechi.
--
-- Applicata sul live via Management API, poi
-- `supabase migration repair --status applied 20280911000003 --linked`.

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
  v_riga jsonb;
  v_item_id uuid; v_qty numeric; v_stock_item_id uuid;
  v_ordered numeric; v_already numeric; v_residual numeric;
  v_righe int := 0; v_tot numeric := 0; v_errori jsonb := '[]'::jsonb;
  v_mancante numeric; v_completo boolean;
  v_ddt_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized: no auth.uid()'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Nessuna azienda attiva'; END IF;

  SELECT supplier_id, oda_number INTO v_supplier_id, v_oda_number
    FROM public.purchase_orders
   WHERE id = p_oda_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine non valido per questa azienda'; END IF;

  -- ── Testata della bolla ────────────────────────────────────────────────────
  INSERT INTO public.ddt_ricezione (
    company_id, purchase_order_id, numero_ddt, data_ricezione, stato,
    note, source, warehouse_id, ddt_file_url, created_by, quantita_ricevuta
  ) VALUES (
    v_company_id, p_oda_id, NULLIF(btrim(coalesce(p_ddt_number, '')), ''),
    coalesce(p_ddt_data, CURRENT_DATE), 'ricevuto',
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

      SELECT quantity, coalesce(quantity_received, 0)
        INTO v_ordered, v_already
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
             received_date = coalesce(p_ddt_data, CURRENT_DATE)
       WHERE id = v_item_id AND purchase_order_id = p_oda_id;

      -- Carico di magazzino SOLO se la riga è stata abbinata a un articolo.
      IF v_stock_item_id IS NOT NULL AND p_warehouse_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.warehouse_stock WHERE id = v_stock_item_id AND company_id = v_company_id) THEN
          INSERT INTO public.warehouse_movements(
            stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id
          ) VALUES (
            v_stock_item_id, 'carico', v_qty::integer,
            'Arrivo merce ordine ' || coalesce(v_oda_number, '') ||
              coalesce(' · bolla ' || NULLIF(btrim(coalesce(p_ddt_number, '')), ''), ''),
            auth.uid(), v_company_id, p_warehouse_id
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
         actual_delivery_date = CASE WHEN v_completo THEN coalesce(p_ddt_data, CURRENT_DATE) ELSE actual_delivery_date END,
         updated_at = now()
   WHERE id = p_oda_id AND company_id = v_company_id
     AND status NOT IN ('annullato');

  UPDATE public.ddt_ricezione
     SET quantita_ricevuta = v_tot,
         stato = CASE WHEN v_completo THEN 'ricevuto' ELSE 'parziale' END
   WHERE id = v_ddt_id;

  RETURN QUERY SELECT v_ddt_id, v_righe, v_tot, v_completo, v_errori;
END
$function$;

REVOKE ALL ON FUNCTION public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text) IS
  'Registra un arrivo merce da ordine a fornitore con le quantità scritte a mano: aggiorna le righe (mai oltre il residuo), crea la bolla, carica il magazzino solo per le righe abbinate a un articolo, e porta l''ordine in parziale o ricevuto.';
