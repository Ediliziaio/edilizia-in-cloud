-- Distribuita in produzione il 2026-11-06: migrazione 20261106075753.
-- Baseline per replay/test: non riapplicare su funzioni già aggiornate.
-- CHECK-56 / CHECK-84: protezione delle nuove ricezioni.
-- Protegge nuove ricezioni; non modifica né ricostruisce lo storico.
-- Applicare solo dopo verifica della definizione e collaudo dei trigger reali.
DO $patch$
DECLARE
  definizione text;
  punto text := '  INSERT INTO public.goods_receipts (';
  guardia text := $guardia$
  -- CHECK84_GUARDIA_RICEZIONI_V1
  DECLARE
    v_po_id uuid;
    v_po_status text;
    v_righe integer;
    v_ordinato numeric;
    v_ricevuto_oda numeric;
    v_ricevuto_bolle numeric;
  BEGIN
    IF p_quantity_received IS NULL OR p_quantity_received <= 0
       OR p_quantity_received::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Quantità ricevuta non valida';
    END IF;
    -- goods_receipts.quantity_received è integer nello schema verificato:
    -- impedire l'arrotondamento implicito di un ingresso numeric.
    IF p_quantity_received <> trunc(p_quantity_received) THEN
      RAISE EXCEPTION 'Questa ricezione non supporta quantità frazionarie: nessun movimento registrato';
    END IF;
    IF p_warehouse_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND company_id=v_company_id
    ) THEN RAISE EXCEPTION 'Magazzino non appartenente all’azienda'; END IF;
    IF p_ddt_ricezione_id IS NOT NULL THEN
      SELECT purchase_order_id INTO v_po_id FROM public.ddt_ricezione
        WHERE id=p_ddt_ricezione_id AND company_id=v_company_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'DDT non appartenente all’azienda'; END IF;
      IF v_po_id IS NOT NULL THEN
        -- Serializza le ricezioni dello stesso OdA, anche da bolle diverse.
        SELECT status INTO v_po_status FROM public.purchase_orders
          WHERE id=v_po_id AND company_id=v_company_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Ordine di acquisto non appartenente all’azienda'; END IF;
        IF v_po_status IS NULL OR v_po_status NOT IN ('inviato','confermato','parziale') THEN
          RAISE EXCEPTION 'Ricezione non consentita per ordine in stato %: verifica e conferma prima l’ordine', v_po_status;
        END IF;
        SELECT count(*), sum(quantity), sum(coalesce(quantity_received,0))
          INTO v_righe,v_ordinato,v_ricevuto_oda FROM public.purchase_order_items
          WHERE purchase_order_id=v_po_id AND order_item_id=p_order_item_id AND company_id=v_company_id;
        IF v_righe <> 1 OR coalesce(v_ordinato,0) <= 0 THEN
          RAISE EXCEPTION 'Articolo non abbinato univocamente all’ordine: verifica le righe prima di ricevere';
        END IF;
        IF EXISTS (SELECT 1 FROM public.goods_receipts
          WHERE order_item_id=p_order_item_id AND company_id=v_company_id AND ddt_ricezione_id IS NULL) THEN
          RAISE EXCEPTION 'Ricezioni senza DDT da riconciliare prima di registrare altra merce';
        END IF;
        SELECT coalesce(sum(g.quantity_received),0) INTO v_ricevuto_bolle
          FROM public.goods_receipts g JOIN public.ddt_ricezione d ON d.id=g.ddt_ricezione_id
          WHERE g.order_item_id=p_order_item_id AND g.company_id=v_company_id
            AND d.purchase_order_id=v_po_id AND d.company_id=v_company_id;
        IF v_ricevuto_bolle <> v_ricevuto_oda THEN
          RAISE EXCEPTION 'Ricezioni e residuo dell’ordine non allineati: riconciliare prima di registrare altra merce';
        END IF;
        IF p_quantity_received > v_ordinato-v_ricevuto_bolle THEN
          RAISE EXCEPTION 'La quantità supera il residuo dell’ordine';
        END IF;
      END IF;
    END IF;
    PERFORM 1 FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  END;
$guardia$;
BEGIN
  SELECT pg_get_functiondef('public.insert_goods_receipt_atomic(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text)'::regprocedure)
    INTO definizione;
  IF position('CHECK84_GUARDIA_RICEZIONI_V1' IN definizione)>0 THEN RETURN; END IF;
  IF (length(definizione)-length(replace(definizione,punto,'')))/length(punto)<>1 THEN
    RAISE EXCEPTION 'CHECK-84: corpo insert_goods_receipt_atomic inatteso, verificare prima di applicare';
  END IF;
  EXECUTE replace(definizione,punto,guardia || E'\n' || punto);
END;
$patch$;
