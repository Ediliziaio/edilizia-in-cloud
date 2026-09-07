-- Arrivo merce anche senza magazzino (07/09/2026).
--
-- `ddt_ricezione.warehouse_id` era NOT NULL: impediva di registrare una bolla
-- alle aziende che non tengono il magazzino — proprio il caso di Ke Bei, che ha
-- zero magazzini e vuole solo sapere che cosa è arrivato dell'ordine. Allentare
-- il vincolo è sicuro: nessuna riga esistente ha il campo vuoto.
ALTER TABLE public.ddt_ricezione ALTER COLUMN warehouse_id DROP NOT NULL;

COMMENT ON COLUMN public.ddt_ricezione.warehouse_id IS
  'Magazzino di destinazione. NULL quando l''azienda non usa il magazzino: la bolla vale come registrazione di ciò che è arrivato dall''ordine.';

-- Numero bolla: resta obbligatorio in tabella, ma se chi registra non ce l'ha
-- sottomano mettiamo un segnaposto invece di far fallire tutto l'arrivo.
CREATE OR REPLACE FUNCTION public.oda_registra_arrivo(
  p_oda_id        uuid,
  p_righe         jsonb,
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
  v_ddt_id uuid; v_numero text; v_data date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized: no auth.uid()'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Nessuna azienda attiva'; END IF;

  SELECT supplier_id, oda_number INTO v_supplier_id, v_oda_number
    FROM public.purchase_orders
   WHERE id = p_oda_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine non valido per questa azienda'; END IF;

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

      IF v_stock_item_id IS NOT NULL AND p_warehouse_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.warehouse_stock WHERE id = v_stock_item_id AND company_id = v_company_id) THEN
          INSERT INTO public.warehouse_movements(
            stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id
          ) VALUES (
            v_stock_item_id, 'carico', v_qty::integer,
            'Arrivo merce ordine ' || coalesce(v_oda_number, '') || ' · bolla ' || v_numero,
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

  RETURN QUERY SELECT v_ddt_id, v_righe, v_tot, v_completo, v_errori;
END
$function$;
