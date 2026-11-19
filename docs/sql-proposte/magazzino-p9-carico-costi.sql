-- SOLO LOCALE. Richiede P2-P8. Non inserire in supabase/migrations e non applicare online.
-- Stessa firma e stessa chiave del carico: il costo vive nel payload idempotente della prima riga.
SET lock_timeout='3s'; SET statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.warehouse_register_carico_v2(
  p_warehouse_id uuid,p_supplier_id uuid,p_scans jsonb,p_request_id uuid,
  p_ddt_ricezione_id uuid DEFAULT NULL,p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company uuid; replay jsonb; result jsonb; scan jsonb; item public.warehouse_stock;
  qty numeric; price numeric; section uuid; offline uuid; serials jsonb; serial text;
  n integer:=0; units integer:=0; cost_data jsonb; cost_id uuid; cost_amount numeric:=0; cost_paid boolean; cost_date date; cost_vat numeric;
BEGIN
  SELECT company_id INTO company FROM public.warehouses WHERE id=p_warehouse_id AND is_active;
  PERFORM public.warehouse_access_v2(company,'can_edit_warehouse');
  PERFORM public.warehouse_location_access_v2(company,p_warehouse_id);
  IF p_supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND company_id=company) THEN
    RAISE EXCEPTION 'Fornitore non accessibile.' USING ERRCODE='42501'; END IF;
  IF p_ddt_ricezione_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ddt_ricezione WHERE id=p_ddt_ricezione_id AND company_id=company AND (warehouse_id IS NULL OR warehouse_id=p_warehouse_id)) THEN
    RAISE EXCEPTION 'Documento di ricezione non accessibile.' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_scans) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scans)=0 OR jsonb_array_length(p_scans)>500 THEN
    RAISE EXCEPTION 'Elenco articoli non valido.' USING ERRCODE='22023'; END IF;
  cost_data:=p_scans->0->'company_cost';
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_scans) WITH ORDINALITY s(scan,ord) WHERE s.ord>1 AND s.scan ? 'company_cost') THEN
    RAISE EXCEPTION 'Indica un solo costo per il carico.' USING ERRCODE='22023'; END IF;
  IF cost_data IS NOT NULL THEN
    IF jsonb_typeof(cost_data)<>'object' OR p_ddt_ricezione_id IS NOT NULL THEN
      RAISE EXCEPTION 'Il costo facoltativo è disponibile solo per un carico libero.' USING ERRCODE='22023'; END IF;
    IF NOT coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',company),false)
      AND NOT coalesce(public.has_permission_for_company(auth.uid(),'can_manage_purchasing',company),false)
      AND NOT coalesce(public.e_super_admin_dentro(company),false) THEN
      RAISE EXCEPTION 'Non hai il permesso di registrare costi aziendali.' USING ERRCODE='42501'; END IF;
    IF coalesce(public.utente_bloccato(),true) OR coalesce(public.utente_sola_lettura(company),true) THEN
      RAISE EXCEPTION 'Non hai il permesso di registrare costi aziendali.' USING ERRCODE='42501'; END IF;
    cost_paid:=coalesce((cost_data->>'is_paid')::boolean,false);
    cost_date:=nullif(cost_data->>'date','')::date;
    cost_vat:=(cost_data->>'vat_rate')::numeric;
    IF cost_date IS NULL OR cost_vat IS NULL OR cost_vat NOT IN (0,4,5,10,22)
      OR coalesce(length(btrim(cost_data->>'category')),0) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Verifica data, categoria e IVA del costo.' USING ERRCODE='22023'; END IF;
  END IF;
  replay:=public.warehouse_claim_v2(company,p_request_id,'carico',jsonb_build_object('warehouse',p_warehouse_id,'supplier',p_supplier_id,'scans',p_scans,'ddt',p_ddt_ricezione_id,'notes',p_notes));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM id FROM public.warehouse_stock WHERE company_id=company AND id IN
    (SELECT (s->>'stock_item_id')::uuid FROM jsonb_array_elements(p_scans) s) ORDER BY id FOR UPDATE;
  FOR scan IN SELECT * FROM jsonb_array_elements(p_scans) LOOP
    SELECT * INTO item FROM public.warehouse_stock WHERE id=(scan->>'stock_item_id')::uuid AND company_id=company
      AND (warehouse_id=p_warehouse_id OR warehouse_id IS NULL);
    IF item.id IS NULL THEN RAISE EXCEPTION 'Articolo non presente nel magazzino scelto.' USING ERRCODE='P0002'; END IF;
    qty:=(scan->>'quantity')::numeric; price:=nullif(scan->>'unit_price','')::numeric;
    IF cost_data IS NOT NULL THEN
      IF price IS NULL THEN RAISE EXCEPTION 'Indica il prezzo di ogni articolo per registrare il costo.' USING ERRCODE='22023'; END IF;
      cost_amount:=cost_amount+round(qty*price,2);
    END IF;
    section:=nullif(scan->>'section_id','')::uuid; offline:=nullif(scan->>'offline_client_uuid','')::uuid;
    IF qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<=0 OR qty>2147483647 OR
      (price IS NOT NULL AND (price::text IN ('NaN','Infinity','-Infinity') OR price<0)) THEN
      RAISE EXCEPTION 'Quantità o prezzo non validi.' USING ERRCODE='22023'; END IF;
    IF (item.tracking_mode='serialized' OR public.unita_confrontabile(item.unita_misura)='pz') AND qty<>trunc(qty) THEN
      RAISE EXCEPTION 'Per questo articolo servono unità intere.' USING ERRCODE='22023'; END IF;
    IF section IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.warehouse_sections WHERE id=section AND company_id=company AND warehouse_id=p_warehouse_id) THEN
      RAISE EXCEPTION 'Ubicazione non valida.' USING ERRCODE='42501'; END IF;
    IF offline IS NULL THEN RAISE EXCEPTION 'Manca l’identità della riga di carico.' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.warehouse_scan_events WHERE offline_client_uuid=offline) THEN
      RAISE EXCEPTION 'Questa riga è già stata caricata. Controlla i movimenti.' USING ERRCODE='PT409'; END IF;
    serials:=coalesce(scan->'serial_numbers','[]'::jsonb);
    IF item.tracking_mode='serialized' THEN
      IF jsonb_typeof(serials) IS DISTINCT FROM 'array' OR jsonb_array_length(serials)<>qty OR
        (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(serials) t(value) WHERE nullif(btrim(value),'') IS NOT NULL)<>qty THEN
        RAISE EXCEPTION 'Seleziona un seriale distinto per ogni pezzo.' USING ERRCODE='22023'; END IF;
      FOR serial IN SELECT jsonb_array_elements_text(serials) LOOP
        IF EXISTS(SELECT 1 FROM public.stock_units WHERE company_id=company AND serial_number=serial) THEN
          RAISE EXCEPTION 'Seriale % già presente.',serial USING ERRCODE='PT409'; END IF;
        INSERT INTO public.stock_units(company_id,stock_item_id,serial_number,status,warehouse_id,section_id,supplier_id,purchase_price,purchase_ddt_ricezione_id,purchase_date,created_by)
          VALUES(company,item.id,serial,'available',p_warehouse_id,section,p_supplier_id,price,p_ddt_ricezione_id,current_date,auth.uid());
        units:=units+1;
      END LOOP;
    ELSIF serials IS DISTINCT FROM 'null'::jsonb AND serials<>'[]'::jsonb THEN
      RAISE EXCEPTION 'Articolo senza matricole: rimuovi i seriali.' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.warehouse_movements(stock_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,unit_cost)
      VALUES(item.id,'carico',qty,coalesce(p_notes,'Carico merce'),auth.uid(),company,p_warehouse_id,price);
    UPDATE public.warehouse_stock SET quantity=quantity+qty,warehouse_id=coalesce(warehouse_id,p_warehouse_id),
      supplier_id=coalesce(supplier_id,p_supplier_id),section_id=coalesce(section,section_id),last_delivery_date=current_date,updated_at=now() WHERE id=item.id;
    INSERT INTO public.warehouse_scan_events(company_id,user_id,warehouse_id,scanned_code,scan_format,scan_type,resolved_stock_item_id,resolution_status,supplier_id,quantity,offline_client_uuid,synced_from_offline)
      VALUES(company,auth.uid(),p_warehouse_id,coalesce(scan->>'raw_code',''),nullif(scan->>'scan_format',''),'carico',item.id,'matched',p_supplier_id,qty,offline,true);
    n:=n+1;
  END LOOP;
  IF cost_data IS NOT NULL THEN
    IF cost_amount<=0 THEN RAISE EXCEPTION 'Il costo deve avere un imponibile maggiore di zero.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.company_costs(company_id,name,cost_type,amount,vat_rate,supplier_id,due_date,is_paid,paid_date,category,recurrence,notes)
      VALUES(company,'Acquisto materiali · carico magazzino','variable',cost_amount,cost_vat,p_supplier_id,cost_date,cost_paid,
        CASE WHEN cost_paid THEN cost_date ELSE NULL END,btrim(cost_data->>'category'),'once','Carico magazzino · richiesta '||p_request_id::text)
      RETURNING id INTO cost_id;
  END IF;
  result:=jsonb_build_object('created_movements',n,'created_units',units,'updated_items',n,'errors','[]'::jsonb,'company_cost_id',cost_id,'company_cost_amount',CASE WHEN cost_id IS NOT NULL THEN cost_amount ELSE NULL END);
  UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=company AND request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_register_carico_v2(uuid,uuid,jsonb,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_register_carico_v2(uuid,uuid,jsonb,uuid,uuid,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.warehouse_capabilities_v2(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_view_warehouse');
 RETURN jsonb_build_object('version',3,'atomic_reservations',true,'idempotent_carichi',true,'atomic_company_cost',true,'idempotent_uscite',true,'fractional_returns',true,'serial_returns',true,'atomic_import',true,'atomic_transfers',true,'inventory_counts',true,'reorder',true,'idempotent_oda_receipts',true,'idempotent_goods_receipts',true);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_capabilities_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_capabilities_v2(uuid) TO authenticated;
