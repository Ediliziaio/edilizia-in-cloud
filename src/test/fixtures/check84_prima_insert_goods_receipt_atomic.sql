CREATE OR REPLACE FUNCTION public.insert_goods_receipt_atomic(p_order_item_id uuid, p_warehouse_id uuid, p_quantity_received numeric, p_quality_check_status text, p_supplier_id uuid DEFAULT NULL::uuid, p_ddt_number text DEFAULT NULL::text, p_ddt_photo_url text DEFAULT NULL::text, p_ddt_ricezione_id uuid DEFAULT NULL::uuid, p_quality_notes text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_company_id uuid; v_item_company_id uuid; v_receipt_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized: no auth.uid()'; END IF;
  v_company_id := public.get_my_company_id();
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Nessuna company attiva'; END IF;

  SELECT o.company_id INTO v_item_company_id
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id;
  IF v_item_company_id IS NULL THEN RAISE EXCEPTION 'Order item % non trovato', p_order_item_id; END IF;
  IF v_item_company_id <> v_company_id THEN RAISE EXCEPTION 'Forbidden: order item di altra company'; END IF;

  INSERT INTO public.goods_receipts (
    order_item_id, warehouse_id, company_id, supplier_id, quantity_received, ddt_number,
    ddt_photo_url, quality_check_status, quality_notes, notes, received_by, ddt_ricezione_id
  ) VALUES (
    p_order_item_id, p_warehouse_id, v_company_id, p_supplier_id, p_quantity_received, p_ddt_number,
    p_ddt_photo_url, p_quality_check_status, p_quality_notes, p_notes, v_user_id, p_ddt_ricezione_id
  ) RETURNING id INTO v_receipt_id;

  UPDATE public.order_items
     SET quantity_received = COALESCE(quantity_received, 0) + p_quantity_received,
         receipt_id = v_receipt_id, fulfillment_status = 'received', last_goods_receipt_date = now()
   WHERE id = p_order_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order item update fallito per id %', p_order_item_id; END IF;

  BEGIN
    INSERT INTO public.order_item_timeline (order_item_id, company_id, event_type, event_by, photo_url, document_ref, notes, location)
    VALUES (p_order_item_id, v_company_id, 'received', v_user_id, p_ddt_photo_url, v_receipt_id,
            COALESCE(p_notes, format('Ricevuto %s pz - Qualità: %s', p_quantity_received, p_quality_check_status)), 'Magazzino');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Timeline insert skipped: %', SQLERRM; END;

  RETURN v_receipt_id;
END; $function$
