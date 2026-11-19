-- SOLO PROPOSTA LOCALE: nessuna migrazione online. Richiede P2–P7.
-- Mantiene permessi, identità richiesta e lock; vincola la prenotazione al fabbisogno residuo.
CREATE OR REPLACE FUNCTION public.warehouse_reserve_v2(p_order_item_id uuid,p_quantity numeric,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.order_items; o public.orders; replay jsonb; result jsonb; balance jsonb; outstanding numeric;
BEGIN
  SELECT * INTO r FROM public.order_items WHERE id=p_order_item_id;
  SELECT * INTO o FROM public.orders WHERE id=r.order_id;
  PERFORM public.warehouse_access_v2(o.company_id,'can_edit_orders');
  PERFORM public.warehouse_access_v2(o.company_id,'can_edit_warehouse');
  IF o.id IS NULL OR NOT public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id) OR r.stock_item_id IS NULL THEN
    RAISE EXCEPTION 'Riga non accessibile.' USING ERRCODE='42501'; END IF;
  PERFORM public.warehouse_location_access_v2(o.company_id,(SELECT warehouse_id FROM public.warehouse_stock WHERE id=r.stock_item_id));
  replay:=public.warehouse_claim_v2(o.company_id,p_request_id,'reserve',jsonb_build_object('riga',p_order_item_id,'quantity',p_quantity));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  SELECT * INTO r FROM public.order_items WHERE id=p_order_item_id AND order_id=o.id FOR UPDATE;
  IF r.id IS NULL OR r.stock_item_id IS NULL OR r.status='installato' THEN RAISE EXCEPTION 'La riga non è più prenotabile.' USING ERRCODE='PT409'; END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity<0 OR p_quantity>coalesce(r.quantity,0) THEN
    RAISE EXCEPTION 'Quantità prenotata non valida.' USING ERRCODE='22023'; END IF;
  -- La riga è già bloccata, nello stesso ordine usato dal prelievo.
  -- Il fabbisogno è al netto del materiale ancora fuori deposito.
  PERFORM public.warehouse_location_access_v2(o.company_id,(SELECT warehouse_id FROM public.warehouse_stock WHERE id=r.stock_item_id));
  balance:=public.warehouse_return_state_v2(o.id,r.stock_item_id,r.id);
  outstanding:=greatest((balance->>'issued')::numeric-(balance->>'returned')::numeric,0);
  IF p_quantity>greatest(coalesce(r.quantity,0)-outstanding,0) THEN
    RAISE EXCEPTION 'Prenotazione oltre il fabbisogno residuo: massimo %.',greatest(coalesce(r.quantity,0)-outstanding,0) USING ERRCODE='PT409';
  END IF;
  UPDATE public.order_items SET fulfillment_status=CASE WHEN p_quantity>0 THEN 'received' WHEN outstanding>0 THEN r.fulfillment_status ELSE 'not_started' END,
    warehouse_reserved_quantity=p_quantity WHERE id=r.id;
  result:=jsonb_build_object('order_item_id',r.id,'reserved',p_quantity);
  UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=o.company_id AND request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_reserve_v2(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_reserve_v2(uuid,numeric,uuid) TO authenticated;
