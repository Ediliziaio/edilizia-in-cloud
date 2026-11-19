-- SOLO LOCALE. Fuori da supabase/migrations: non applicare al servizio online.
-- Protocollo 2: identità delle richieste, prenotazioni atomiche, resi per origine.
SET lock_timeout = '3s';
SET statement_timeout = '60s';

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS warehouse_reserved_quantity numeric;
CREATE TABLE IF NOT EXISTS public.warehouse_operation_requests (
  company_id uuid NOT NULL REFERENCES public.companies(id), request_id uuid NOT NULL,
  actor_id uuid NOT NULL, operation text NOT NULL, payload jsonb NOT NULL,
  response jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id, request_id)
);
CREATE TABLE IF NOT EXISTS public.warehouse_return_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_movement_id uuid NOT NULL REFERENCES public.warehouse_movements(id) ON DELETE RESTRICT,
  return_movement_id uuid NOT NULL REFERENCES public.warehouse_movements(id) ON DELETE RESTRICT,
  stock_unit_id uuid REFERENCES public.stock_units(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK(quantity > 0),
  UNIQUE(return_movement_id, outbound_movement_id)
);
CREATE INDEX IF NOT EXISTS warehouse_return_allocations_source_idx ON public.warehouse_return_allocations(outbound_movement_id);
CREATE TABLE IF NOT EXISTS public.warehouse_unit_exits (
  stock_unit_id uuid NOT NULL REFERENCES public.stock_units(id) ON DELETE RESTRICT,
  movement_id uuid NOT NULL REFERENCES public.warehouse_movements(id) ON DELETE RESTRICT,
  returned_by uuid REFERENCES public.warehouse_movements(id) ON DELETE RESTRICT,
  PRIMARY KEY(stock_unit_id, movement_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_unit_exits_active_idx ON public.warehouse_unit_exits(stock_unit_id) WHERE returned_by IS NULL;
ALTER TABLE public.warehouse_operation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_return_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_unit_exits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_operation_requests, public.warehouse_return_allocations, public.warehouse_unit_exits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_access_v2(p_company uuid, p_permission text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR p_company IS NULL OR NOT (
    coalesce(public.has_permission_for_company(auth.uid(), p_permission, p_company), false)
    OR coalesce(public.e_super_admin_dentro(p_company), false)
  ) THEN RAISE EXCEPTION 'Operazione non autorizzata per questa azienda.' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_access_v2(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_location_allowed_v2(p_company uuid,p_warehouse uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse AND company_id=p_company AND is_active) AND (
  coalesce(public.e_super_admin_dentro(p_company),false)
  OR (public.has_role(auth.uid(),'company_admin'::public.app_role) AND public.get_user_company_id(auth.uid())=p_company)
  OR EXISTS(SELECT 1 FROM public.multi_company_access m WHERE m.user_id=auth.uid() AND m.company_id=p_company AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now()) AND m.access_role::text='company_admin')
  OR EXISTS(SELECT 1 FROM public.warehouse_assignments a WHERE a.warehouse_id=p_warehouse AND a.user_id=auth.uid() AND a.active)
 )
$$;
REVOKE ALL ON FUNCTION public.warehouse_location_allowed_v2(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.warehouse_location_access_v2(p_company uuid,p_warehouse uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT coalesce(public.warehouse_location_allowed_v2(p_company,p_warehouse),false) THEN RAISE EXCEPTION 'Non sei assegnato a questo magazzino.' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_location_access_v2(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_claim_v2(p_company uuid,p_request uuid,p_operation text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.warehouse_operation_requests;
BEGIN
  IF p_request IS NULL THEN RAISE EXCEPTION 'Manca la chiave della richiesta.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.warehouse_operation_requests(company_id,request_id,actor_id,operation,payload)
    VALUES(p_company,p_request,auth.uid(),p_operation,p_payload) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.warehouse_operation_requests WHERE company_id=p_company AND request_id=p_request FOR UPDATE;
  IF r.actor_id IS DISTINCT FROM auth.uid() OR r.operation IS DISTINCT FROM p_operation OR r.payload IS DISTINCT FROM p_payload THEN
    RAISE EXCEPTION 'Chiave già usata per un’altra operazione o dati diversi.' USING ERRCODE='PT409';
  END IF;
  RETURN r.response;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_claim_v2(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_effective_reserve_v2(p_status text,p_quantity numeric,p_explicit numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN public.fulfillment_status_holds_reserve(p_status) THEN greatest(coalesce(p_explicit,p_quantity,0),0) ELSE 0 END
$$;
REVOKE ALL ON FUNCTION public.warehouse_effective_reserve_v2(text,numeric,numeric) FROM PUBLIC,anon,authenticated;

-- Un solo trigger: delta precisi, senza ceil né clamp che nascondano errori.
-- Ordine dei lock: riga della commessa, schede di magazzino ordinate, seriali.
CREATE OR REPLACE FUNCTION public.warehouse_reservation_guard_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_id uuid; new_id uuid; old_qty numeric:=0; new_qty numeric:=0; sid uuid; delta numeric; w public.warehouse_stock;
  company uuid; old_company uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN
    old_id:=OLD.stock_item_id;
    SELECT company_id INTO old_company FROM public.orders WHERE id=OLD.order_id;
    old_qty:=public.warehouse_effective_reserve_v2(OLD.fulfillment_status,OLD.quantity,OLD.warehouse_reserved_quantity);
  END IF;
  IF TG_OP<>'DELETE' THEN
    new_id:=NEW.stock_item_id;
    SELECT company_id INTO company FROM public.orders WHERE id=NEW.order_id;
    IF NEW.status='installato' THEN NEW.fulfillment_status:='delivered'; NEW.warehouse_reserved_quantity:=0; END IF;
    IF NEW.warehouse_reserved_quantity IS NOT NULL AND (
      NEW.warehouse_reserved_quantity::text IN ('NaN','Infinity','-Infinity') OR NEW.warehouse_reserved_quantity<0
      OR NEW.warehouse_reserved_quantity>coalesce(NEW.quantity,0)
    ) THEN RAISE EXCEPTION 'Quantità prenotata non valida.' USING ERRCODE='22023'; END IF;
    new_qty:=public.warehouse_effective_reserve_v2(NEW.fulfillment_status,NEW.quantity,NEW.warehouse_reserved_quantity);
  END IF;
  FOR sid IN SELECT id FROM public.warehouse_stock WHERE id IN (old_id,new_id) ORDER BY id FOR UPDATE LOOP
    SELECT * INTO w FROM public.warehouse_stock WHERE id=sid;
    IF (sid=old_id AND w.company_id IS DISTINCT FROM old_company) OR (sid=new_id AND w.company_id IS DISTINCT FROM company) THEN
      RAISE EXCEPTION 'Articolo di un’altra azienda.' USING ERRCODE='42501';
    END IF;
    IF sid=new_id AND (w.tracking_mode='serialized' OR public.unita_confrontabile(w.unita_misura)='pz') AND new_qty<>trunc(new_qty) THEN
      RAISE EXCEPTION 'Per questo articolo si prenotano unità intere.' USING ERRCODE='22023'; END IF;
    delta:=CASE WHEN sid=new_id THEN new_qty ELSE 0 END-CASE WHEN sid=old_id THEN old_qty ELSE 0 END;
    IF coalesce(w.quantity_reserved,0)+delta<0 OR coalesce(w.quantity_reserved,0)+delta>coalesce(w.quantity,0) THEN
      RAISE EXCEPTION 'Prenotazione non disponibile: liberi %, richiesti %.', w.quantity-w.quantity_reserved,delta USING ERRCODE='PT409';
    END IF;
    UPDATE public.warehouse_stock SET quantity_reserved=coalesce(quantity_reserved,0)+delta,updated_at=now() WHERE id=sid;
  END LOOP;
  IF new_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.warehouse_stock WHERE id=new_id) THEN
    RAISE EXCEPTION 'Articolo di magazzino non trovato.' USING ERRCODE='P0002';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_reservation_guard_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS oi_reserve_on_insert ON public.order_items;
DROP TRIGGER IF EXISTS oi_reserve_on_update ON public.order_items;
DROP TRIGGER IF EXISTS oi_reserve_on_delete ON public.order_items;
DROP TRIGGER IF EXISTS b_warehouse_reservation_v2 ON public.order_items;
CREATE TRIGGER b_warehouse_reservation_v2 BEFORE INSERT OR UPDATE OF fulfillment_status,stock_item_id,quantity,warehouse_reserved_quantity,status,order_id OR DELETE
  ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.warehouse_reservation_guard_v2();

-- Vale anche per scritture legacy sullo stock: un aggiornamento concorrente non
-- può portare via la quantità riservata. Nessuna bonifica massiva dei dati.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.warehouse_stock'::regclass AND conname='warehouse_reserved_within_stock_v2') THEN
    ALTER TABLE public.warehouse_stock ADD CONSTRAINT warehouse_reserved_within_stock_v2
      CHECK(quantity::text NOT IN ('NaN','Infinity','-Infinity') AND quantity_reserved::text NOT IN ('NaN','Infinity','-Infinity') AND quantity_reserved>=0 AND quantity_reserved<=quantity) NOT VALID;
  END IF;
END $$;

-- L'articolo fungibile può essere misurato; una matricola è sempre un pezzo.
CREATE OR REPLACE FUNCTION public.order_items_magazzino_pezzi_interi()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE tracking text; unit text;
BEGIN
  IF NEW.stock_item_id IS NOT NULL THEN
    SELECT tracking_mode,coalesce(unita_misura,NEW.unita_misura) INTO tracking,unit FROM public.warehouse_stock WHERE id=NEW.stock_item_id;
    IF NEW.quantity::text IN ('NaN','Infinity','-Infinity') OR NEW.quantity<0 OR
      ((tracking='serialized' OR public.unita_confrontabile(unit) IN ('pz','cad')) AND NEW.quantity<>trunc(NEW.quantity)) THEN
      RAISE EXCEPTION 'Quantità non valida per l’unità di questo articolo.' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.order_items_magazzino_pezzi_interi() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_capabilities_v2(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.warehouse_access_v2(p_company_id,'can_view_warehouse');
  RETURN jsonb_build_object('version',2,'atomic_reservations',true,'idempotent_uscite',true,'idempotent_carichi',true,'fractional_returns',true,'serial_returns',true);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_capabilities_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_capabilities_v2(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_reserve_v2(p_order_item_id uuid,p_quantity numeric,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.order_items; o public.orders; replay jsonb; result jsonb;
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
  UPDATE public.order_items SET fulfillment_status=CASE WHEN p_quantity>0 THEN 'received' ELSE 'not_started' END,
    warehouse_reserved_quantity=p_quantity WHERE id=r.id;
  result:=jsonb_build_object('order_item_id',r.id,'reserved',p_quantity);
  UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=o.company_id AND request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_reserve_v2(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_reserve_v2(uuid,numeric,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_register_uscita_v2(
  p_warehouse_id uuid,p_destinatario jsonb,p_scans jsonb,p_request_id uuid,
  p_vettore jsonb DEFAULT NULL,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company uuid; target_order public.orders; target_customer uuid;
  kind text:=coalesce(p_destinatario->>'tipo','libero'); replay jsonb; result jsonb;
  scan jsonb; item public.warehouse_stock; line public.order_items; unit public.stock_units;
  stock_id uuid; line_id uuid; qty numeric; requested numeric; own numeric; remaining numeric; take numeric;
  serial text; serials jsonb; movement uuid; exit_id uuid:=gen_random_uuid();
  seq integer; year integer:=extract(year from current_date); code text; lines jsonb:='[]'; n integer:=0; units integer:=0;
BEGIN
  SELECT company_id INTO company FROM public.warehouses WHERE id=p_warehouse_id AND is_active;
  PERFORM public.warehouse_access_v2(company,'can_edit_warehouse');
  PERFORM public.warehouse_location_access_v2(company,p_warehouse_id);
  IF kind NOT IN ('cliente','cantiere','libero') THEN RAISE EXCEPTION 'Destinatario non valido.' USING ERRCODE='22023'; END IF;
  IF nullif(p_destinatario->>'order_id','') IS NOT NULL THEN
    SELECT * INTO target_order FROM public.orders WHERE id=(p_destinatario->>'order_id')::uuid AND company_id=company AND deleted_at IS NULL;
    IF target_order.id IS NULL OR NOT public.can_see_order(target_order.id,target_order.assigned_to,target_order.destination_warehouse_id) THEN
      RAISE EXCEPTION 'Commessa non accessibile.' USING ERRCODE='42501'; END IF;
  END IF;
  IF kind='cantiere' AND target_order.id IS NULL THEN RAISE EXCEPTION 'Scegli la commessa.' USING ERRCODE='22023'; END IF;
  IF nullif(p_destinatario->>'customer_id','') IS NOT NULL THEN
    SELECT id INTO target_customer FROM public.customers WHERE id=(p_destinatario->>'customer_id')::uuid AND company_id=company;
    IF target_customer IS NULL THEN RAISE EXCEPTION 'Cliente non accessibile.' USING ERRCODE='42501'; END IF;
  END IF;
  IF kind='cliente' AND target_customer IS NULL THEN RAISE EXCEPTION 'Scegli il cliente.' USING ERRCODE='22023'; END IF;
  IF kind='libero' AND nullif(btrim(p_destinatario->'libero'->>'ragione_sociale'),'') IS NULL THEN RAISE EXCEPTION 'Indica la destinazione.' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_scans) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scans)=0 OR jsonb_array_length(p_scans)>500 THEN
    RAISE EXCEPTION 'Elenco articoli non valido.' USING ERRCODE='22023'; END IF;
  replay:=public.warehouse_claim_v2(company,p_request_id,'uscita',jsonb_build_object('warehouse',p_warehouse_id,'destinatario',p_destinatario,'scans',p_scans,'vettore',p_vettore,'note',p_note));
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  -- Le righe della sola commessa di destinazione precedono i lock sullo stock,
  -- come avviene in un UPDATE ordinario delle prenotazioni.
  PERFORM id FROM public.order_items WHERE order_id=target_order.id AND stock_item_id IN
    (SELECT (s->>'stock_item_id')::uuid FROM jsonb_array_elements(p_scans) s) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.warehouse_stock WHERE company_id=company AND warehouse_id=p_warehouse_id AND id IN
    (SELECT (s->>'stock_item_id')::uuid FROM jsonb_array_elements(p_scans) s) ORDER BY id FOR UPDATE;
  FOR scan IN SELECT * FROM jsonb_array_elements(p_scans) LOOP
    qty:=(scan->>'quantity')::numeric;
    IF qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<=0 OR qty>2147483647 THEN
      RAISE EXCEPTION 'Quantità non valida.' USING ERRCODE='22023'; END IF;
    SELECT * INTO item FROM public.warehouse_stock WHERE id=(scan->>'stock_item_id')::uuid AND company_id=company AND warehouse_id=p_warehouse_id;
    IF item.id IS NULL THEN RAISE EXCEPTION 'Articolo non presente nel magazzino scelto.' USING ERRCODE='P0002'; END IF;
    IF (item.tracking_mode='serialized' OR public.unita_confrontabile(item.unita_misura) IN ('pz','cad')) AND qty<>trunc(qty) THEN
      RAISE EXCEPTION 'Per questo articolo servono unità intere.' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR stock_id,requested IN SELECT (s->>'stock_item_id')::uuid,sum((s->>'quantity')::numeric) FROM jsonb_array_elements(p_scans) s GROUP BY 1 LOOP
    SELECT * INTO item FROM public.warehouse_stock WHERE id=stock_id;
    SELECT coalesce(sum(public.warehouse_effective_reserve_v2(r.fulfillment_status,r.quantity,r.warehouse_reserved_quantity)),0)
      INTO own FROM public.order_items r WHERE r.order_id=target_order.id AND r.stock_item_id=stock_id;
    IF item.quantity_reserved>item.quantity OR own>item.quantity_reserved THEN
      RAISE EXCEPTION 'Prenotazioni incoerenti: verifica il magazzino prima del prelievo.' USING ERRCODE='PT409'; END IF;
    IF requested>item.quantity-item.quantity_reserved+own THEN
      RAISE EXCEPTION 'Disponibilità cambiata per %: utilizzabili %, richiesti %.',item.name,item.quantity-item.quantity_reserved+own,requested USING ERRCODE='PT409'; END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse_uscite:'||company::text,0));
  SELECT coalesce(max(numero_seq),0)+1 INTO seq FROM public.warehouse_uscite WHERE company_id=company AND anno=year;
  code:='U-'||year||'-'||lpad(seq::text,4,'0');
  INSERT INTO public.warehouse_uscite(id,company_id,warehouse_id,numero,numero_seq,anno,destinatario_tipo,customer_id,order_id,destinatario_libero,cliente_snapshot,vettore,note,stato,created_by)
    VALUES(exit_id,company,p_warehouse_id,code,seq,year,kind,target_customer,target_order.id,p_destinatario->'libero',p_destinatario->'cliente_snapshot',p_vettore,p_note,'registrata',auth.uid());

  FOR scan IN SELECT * FROM jsonb_array_elements(p_scans) LOOP
    stock_id:=(scan->>'stock_item_id')::uuid; qty:=(scan->>'quantity')::numeric; line_id:=nullif(scan->>'order_item_id','')::uuid;
    SELECT * INTO item FROM public.warehouse_stock WHERE id=stock_id;
    IF line_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_items WHERE id=line_id AND order_id=target_order.id AND stock_item_id=stock_id) THEN
      RAISE EXCEPTION 'Riga non coerente con articolo e commessa.' USING ERRCODE='42501'; END IF;
    IF line_id IS NULL THEN
      SELECT CASE WHEN count(*)=1 THEN (array_agg(id))[1] ELSE NULL END INTO line_id FROM public.order_items WHERE order_id=target_order.id AND stock_item_id=stock_id;
    END IF;
    -- Consuma solo gli impegni della propria commessa, senza cambiare il
    -- quantitativo contrattuale. Il trigger libera esattamente il delta.
    remaining:=qty;
    FOR line IN SELECT * FROM public.order_items WHERE order_id=target_order.id AND stock_item_id=stock_id ORDER BY id LOOP
      take:=least(remaining,public.warehouse_effective_reserve_v2(line.fulfillment_status,line.quantity,line.warehouse_reserved_quantity));
      IF take>0 THEN
        UPDATE public.order_items SET warehouse_reserved_quantity=public.warehouse_effective_reserve_v2(line.fulfillment_status,line.quantity,line.warehouse_reserved_quantity)-take WHERE id=line.id;
        remaining:=remaining-take;
      END IF;
      EXIT WHEN remaining=0;
    END LOOP;
    serials:=coalesce(scan->'serial_numbers','[]'::jsonb);
    IF item.tracking_mode='serialized' THEN
      IF jsonb_typeof(serials) IS DISTINCT FROM 'array' OR jsonb_array_length(serials)<>qty OR
         (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(serials) t(value) WHERE nullif(btrim(value),'') IS NOT NULL)<>qty THEN
        RAISE EXCEPTION 'Seleziona un seriale distinto per ogni pezzo.' USING ERRCODE='22023'; END IF;
      PERFORM id FROM public.stock_units WHERE company_id=company AND stock_item_id=stock_id AND serial_number IN (SELECT jsonb_array_elements_text(serials)) ORDER BY id FOR UPDATE;
      FOR serial IN SELECT jsonb_array_elements_text(serials) LOOP
        SELECT * INTO unit FROM public.stock_units WHERE company_id=company AND stock_item_id=stock_id AND warehouse_id=p_warehouse_id AND serial_number=serial FOR UPDATE;
        IF unit.id IS NULL OR NOT(unit.status='available' OR (unit.status='reserved' AND unit.reserved_order_id=target_order.id)) THEN
          RAISE EXCEPTION 'Seriale % non disponibile per questa commessa.',serial USING ERRCODE='PT409'; END IF;
        movement:=gen_random_uuid();
        INSERT INTO public.warehouse_movements(id,stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,order_id,uscita_id,unit_cost,da_prelievo)
          VALUES(movement,stock_id,line_id,'scarico',1,'Uscita '||code||' · S/N '||serial,auth.uid(),company,p_warehouse_id,target_order.id,exit_id,item.unit_cost,true);
        INSERT INTO public.warehouse_unit_exits(stock_unit_id,movement_id) VALUES(unit.id,movement);
        UPDATE public.stock_units SET status='shipped',reserved_order_id=NULL,reserved_order_item_id=NULL,delivered_to_order_id=target_order.id,delivered_order_item_id=line_id,delivered_at=now(),updated_at=now() WHERE id=unit.id;
        units:=units+1; n:=n+1;
      END LOOP;
    ELSE
      IF serials<>'null'::jsonb AND jsonb_array_length(serials)>0 THEN RAISE EXCEPTION 'Articolo senza matricole: rimuovi i seriali.' USING ERRCODE='22023'; END IF;
      INSERT INTO public.warehouse_movements(stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,order_id,uscita_id,unit_cost,da_prelievo)
        VALUES(stock_id,line_id,'scarico',qty,'Uscita '||code,auth.uid(),company,p_warehouse_id,target_order.id,exit_id,item.unit_cost,true);
      n:=n+1;
    END IF;
    UPDATE public.warehouse_stock SET quantity=quantity-qty,updated_at=now() WHERE id=stock_id;
    INSERT INTO public.warehouse_scan_events(company_id,user_id,warehouse_id,scanned_code,scan_type,resolved_stock_item_id,resolution_status,order_id,quantity)
      VALUES(company,auth.uid(),p_warehouse_id,coalesce(scan->>'raw_code',''),'scarico',stock_id,'matched',target_order.id,qty);
    lines:=lines||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'numero_linea',jsonb_array_length(lines)+1,'codice_articolo',coalesce(item.internal_code,''),'descrizione',item.name,
      'quantita',qty,'unita_misura',coalesce(item.unita_misura,'pz'),'prezzo_unitario',item.unit_cost,'imponibile',qty*item.unit_cost,'aliquota_iva',coalesce(item.vat_rate,22)::text,'imposta',0,'totale_riga',qty*item.unit_cost));
  END LOOP;
  UPDATE public.warehouse_uscite SET righe=lines,updated_at=now() WHERE id=exit_id;
  result:=jsonb_build_object('uscita_id',exit_id,'numero',code,'created_movements',n,'updated_units',units,'errors','[]'::jsonb);
  UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=company AND request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_register_uscita_v2(uuid,jsonb,jsonb,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_register_uscita_v2(uuid,jsonb,jsonb,uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_return_state_v2(p_order uuid,p_stock uuid,p_line uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE issued numeric; returned numeric; used numeric; unit text; serials jsonb;
BEGIN
  SELECT coalesce(sum(quantity) FILTER(WHERE movement_type='scarico'),0),
    coalesce(sum(quantity) FILTER(WHERE movement_type='carico' AND rientro_commessa),0)
    INTO issued,returned FROM public.warehouse_movements
    WHERE order_id=p_order AND stock_item_id=p_stock AND order_item_id IS NOT DISTINCT FROM p_line
      AND coalesce(notes,'') NOT LIKE 'Divisione tra le fasi:%';
  SELECT coalesce(r.unita_misura,s.unita_misura) INTO unit FROM public.warehouse_stock s
    LEFT JOIN public.order_items r ON r.id=p_line WHERE s.id=p_stock;
  SELECT coalesce(sum(replace(btrim(m->>'quantita'),',','.')::numeric),0) INTO used
    FROM public.campo_rapportini c CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.materiali_usati)='array' THEN c.materiali_usati ELSE '[]'::jsonb END) m
    WHERE c.order_id=p_order AND c.stato='approvato' AND replace(btrim(coalesce(m->>'quantita','')),',','.')~'^[0-9]+([.][0-9]+)?$'
      AND ((p_line IS NOT NULL AND m->>'order_item_id'=p_line::text AND (coalesce(m->>'stock_item_id','')='' OR m->>'stock_item_id'=p_stock::text))
        OR (p_line IS NULL AND m->>'stock_item_id'=p_stock::text))
      AND (coalesce(btrim(m->>'unita'),'')='' OR public.unita_confrontabile(m->>'unita')=public.unita_confrontabile(unit));
  IF p_line IS NOT NULL AND EXISTS(SELECT 1 FROM public.order_items WHERE id=p_line AND status='installato') THEN
    used:=greatest(used,issued-returned);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'serial_number',u.serial_number) ORDER BY u.serial_number),'[]'::jsonb)
    INTO serials FROM public.warehouse_unit_exits x JOIN public.stock_units u ON u.id=x.stock_unit_id
    JOIN public.warehouse_movements m ON m.id=x.movement_id
    WHERE x.returned_by IS NULL AND m.order_id=p_order AND m.stock_item_id=p_stock AND m.order_item_id IS NOT DISTINCT FROM p_line
      AND u.status='shipped' AND u.delivered_to_order_id=p_order;
  RETURN jsonb_build_object('issued',issued,'returned',returned,'used',used,'remaining',greatest(issued-returned-used,0),'serials',serials);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_return_state_v2(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_return_material_v2(
  p_order_id uuid,p_stock_item_id uuid,p_order_item_id uuid,p_quantity numeric,
  p_serial_numbers jsonb,p_request_id uuid,p_expected_returned numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.orders; w public.warehouse_stock; r public.order_items; s public.stock_units;
  replay jsonb; result jsonb; state jsonb; original public.warehouse_movements;
  qty_left numeric; legacy_left numeric; allocated numeric; available numeric; take numeric; total_value numeric:=0;
  movement uuid; source uuid; serial text; unit text; count_units integer:=0;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL;
  PERFORM public.warehouse_access_v2(o.company_id,'can_edit_warehouse');
  PERFORM public.warehouse_access_v2(o.company_id,'can_edit_orders');
  IF o.id IS NULL OR NOT public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id) THEN
    RAISE EXCEPTION 'Commessa non accessibile.' USING ERRCODE='42501'; END IF;
  PERFORM public.warehouse_location_access_v2(o.company_id,(SELECT warehouse_id FROM public.warehouse_stock WHERE id=p_stock_item_id));
  replay:=public.warehouse_claim_v2(o.company_id,p_request_id,'return',jsonb_build_object('order',p_order_id,'stock',p_stock_item_id,'line',p_order_item_id,'quantity',p_quantity,'serials',p_serial_numbers,'expected',p_expected_returned));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF p_order_item_id IS NOT NULL THEN
    SELECT * INTO r FROM public.order_items WHERE id=p_order_item_id AND order_id=o.id FOR UPDATE;
    IF r.id IS NULL OR r.stock_item_id IS DISTINCT FROM p_stock_item_id THEN
      RAISE EXCEPTION 'Articolo e riga della commessa non coerenti.' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT * INTO w FROM public.warehouse_stock WHERE id=p_stock_item_id AND company_id=o.company_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Articolo di magazzino non disponibile.' USING ERRCODE='P0002'; END IF;
  unit:=coalesce(r.unita_misura,w.unita_misura);
  IF public.unita_confrontabile(unit)='a corpo' OR (r.unita_misura IS NOT NULL AND w.unita_misura IS NOT NULL AND public.unita_confrontabile(r.unita_misura)<>public.unita_confrontabile(w.unita_misura)) THEN
    RAISE EXCEPTION 'Verifica le unità di misura della riga e dell’articolo.' USING ERRCODE='22023'; END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity<=0 THEN
    RAISE EXCEPTION 'Indica una quantità positiva valida.' USING ERRCODE='22023'; END IF;
  IF (w.tracking_mode='serialized' OR public.unita_confrontabile(unit) IN ('pz','cad')) AND p_quantity<>trunc(p_quantity) THEN
    RAISE EXCEPTION 'Per questo articolo il reso richiede unità intere.' USING ERRCODE='22023'; END IF;
  PERFORM id FROM public.warehouse_movements WHERE order_id=o.id AND stock_item_id=w.id AND order_item_id IS NOT DISTINCT FROM p_order_item_id ORDER BY id FOR UPDATE;
  state:=public.warehouse_return_state_v2(o.id,w.id,p_order_item_id);
  IF p_expected_returned IS NOT NULL AND p_expected_returned<>(state->>'returned')::numeric THEN
    RAISE EXCEPTION 'Nel frattempo sono stati registrati altri resi. Aggiorna il residuo.' USING ERRCODE='PT409'; END IF;
  IF p_quantity>(state->>'remaining')::numeric THEN
    RAISE EXCEPTION 'Residuo cambiato: restituibili %, richiesti %.',state->>'remaining',p_quantity USING ERRCODE='PT409'; END IF;

  IF w.tracking_mode='serialized' THEN
    IF jsonb_typeof(p_serial_numbers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_serial_numbers)<>p_quantity OR
      (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_serial_numbers) t(value) WHERE nullif(btrim(value),'') IS NOT NULL)<>p_quantity THEN
      RAISE EXCEPTION 'Seleziona esattamente un seriale distinto per ogni pezzo reso.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.stock_units WHERE company_id=o.company_id AND stock_item_id=w.id AND serial_number IN (SELECT jsonb_array_elements_text(p_serial_numbers)) ORDER BY id FOR UPDATE;
    FOR serial IN SELECT jsonb_array_elements_text(p_serial_numbers) LOOP
      SELECT * INTO s FROM public.stock_units WHERE company_id=o.company_id AND stock_item_id=w.id AND serial_number=serial FOR UPDATE;
      IF s.id IS NULL OR s.status<>'shipped' OR s.delivered_to_order_id IS DISTINCT FROM o.id OR s.warehouse_id IS DISTINCT FROM w.warehouse_id THEN
        RAISE EXCEPTION 'Seriale % non restituibile da questa commessa.',serial USING ERRCODE='PT409'; END IF;
      SELECT m.* INTO original FROM public.warehouse_unit_exits x JOIN public.warehouse_movements m ON m.id=x.movement_id
        WHERE x.stock_unit_id=s.id AND x.returned_by IS NULL AND m.order_id=o.id AND m.stock_item_id=w.id
          AND m.order_item_id IS NOT DISTINCT FROM p_order_item_id;
      IF original.id IS NULL OR original.unit_cost IS NULL THEN
        RAISE EXCEPTION 'Manca l’uscita tracciata del seriale %. Nessuna modifica eseguita.',serial USING ERRCODE='PT409'; END IF;
      movement:=gen_random_uuid();
      INSERT INTO public.warehouse_movements(id,stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,order_id,unit_cost,rientro_commessa,costo_provvisorio)
        VALUES(movement,w.id,p_order_item_id,'carico',1,'Rientro dal cantiere · S/N '||serial,auth.uid(),o.company_id,w.warehouse_id,o.id,original.unit_cost,true,original.costo_provvisorio);
      INSERT INTO public.warehouse_return_allocations(outbound_movement_id,return_movement_id,stock_unit_id,quantity) VALUES(original.id,movement,s.id,1);
      UPDATE public.warehouse_unit_exits SET returned_by=movement WHERE stock_unit_id=s.id AND movement_id=original.id AND returned_by IS NULL;
      UPDATE public.stock_units SET status='available',delivered_to_order_id=NULL,delivered_order_item_id=NULL,delivered_shipment_id=NULL,delivered_at=NULL,reserved_order_id=NULL,reserved_order_item_id=NULL,updated_at=now() WHERE id=s.id;
      count_units:=count_units+1; total_value:=total_value+original.unit_cost;
    END LOOP;
  ELSE
    IF p_serial_numbers IS NOT NULL AND p_serial_numbers<>'null'::jsonb AND p_serial_numbers<>'[]'::jsonb THEN
      RAISE EXCEPTION 'Questo articolo non usa seriali.' USING ERRCODE='22023'; END IF;
    qty_left:=p_quantity;
    -- I resi storici senza allocazioni vengono assorbiti cronologicamente:
    -- non si attribuisce due volte la quantità della stessa uscita.
    SELECT greatest((state->>'returned')::numeric-coalesce(sum(a.quantity),0),0) INTO legacy_left
      FROM public.warehouse_return_allocations a JOIN public.warehouse_movements m ON m.id=a.return_movement_id
      WHERE m.order_id=o.id AND m.stock_item_id=w.id AND m.order_item_id IS NOT DISTINCT FROM p_order_item_id;
    FOR original IN SELECT * FROM public.warehouse_movements WHERE order_id=o.id AND stock_item_id=w.id
      AND order_item_id IS NOT DISTINCT FROM p_order_item_id AND movement_type='scarico'
      AND coalesce(notes,'') NOT LIKE 'Divisione tra le fasi:%' ORDER BY created_at,id FOR UPDATE LOOP
      SELECT coalesce(sum(quantity),0) INTO allocated FROM public.warehouse_return_allocations WHERE outbound_movement_id=original.id;
      available:=greatest(original.quantity-allocated,0);
      take:=least(legacy_left,available); legacy_left:=legacy_left-take; available:=available-take;
      take:=least(qty_left,available);
      IF take<=0 THEN CONTINUE; END IF;
      IF original.unit_cost IS NULL THEN RAISE EXCEPTION 'Costo dell’uscita non disponibile: verifica la valorizzazione.' USING ERRCODE='PT409'; END IF;
      movement:=gen_random_uuid();
      INSERT INTO public.warehouse_movements(id,stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,order_id,unit_cost,rientro_commessa,costo_provvisorio)
        VALUES(movement,w.id,p_order_item_id,'carico',take,'Rientro dal cantiere · uscita '||original.id,auth.uid(),o.company_id,w.warehouse_id,o.id,original.unit_cost,true,original.costo_provvisorio);
      INSERT INTO public.warehouse_return_allocations(outbound_movement_id,return_movement_id,quantity) VALUES(original.id,movement,take);
      qty_left:=qty_left-take; total_value:=total_value+take*original.unit_cost;
      EXIT WHEN qty_left=0;
    END LOOP;
    IF qty_left>0 THEN RAISE EXCEPTION 'Uscite insufficienti per attribuire il reso: nessuna modifica eseguita.' USING ERRCODE='PT409'; END IF;
  END IF;
  UPDATE public.warehouse_stock SET quantity=quantity+p_quantity,updated_at=now() WHERE id=w.id;
  result:=jsonb_build_object('stock_item_id',w.id,'warehouse_id',w.warehouse_id,'quantita',p_quantity,'rientrati',(state->>'returned')::numeric+p_quantity,
    'posati',(state->>'used')::numeric,'avanzano',(state->>'remaining')::numeric-p_quantity,'valore_stornato',CASE WHEN public.has_permission_for_company(auth.uid(),'can_view_costs',o.company_id) THEN total_value ELSE NULL END,'seriali_ripristinati',count_units);
  UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=o.company_id AND request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_return_material_v2(uuid,uuid,uuid,numeric,jsonb,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_return_material_v2(uuid,uuid,uuid,numeric,jsonb,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_return_candidates_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.orders; g record; state jsonb; result jsonb:='[]';
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL;
  PERFORM public.warehouse_access_v2(o.company_id,'can_view_warehouse');
  IF o.id IS NULL OR NOT public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id) THEN
    RAISE EXCEPTION 'Commessa non accessibile.' USING ERRCODE='42501'; END IF;
  FOR g IN SELECT DISTINCT m.stock_item_id,m.order_item_id,s.name,s.warehouse_id,s.tracking_mode,
      coalesce(r.unita_misura,s.unita_misura,'pz') unit,s.unita_misura stock_unit,r.stock_item_id line_stock_item_id,coalesce(r.quantity,0) expected
    FROM public.warehouse_movements m JOIN public.warehouse_stock s ON s.id=m.stock_item_id AND s.company_id=o.company_id
    LEFT JOIN public.order_items r ON r.id=m.order_item_id
    WHERE m.order_id=o.id AND m.movement_type='scarico' AND public.warehouse_location_allowed_v2(o.company_id,s.warehouse_id) AND coalesce(m.notes,'') NOT LIKE 'Divisione tra le fasi:%'
    ORDER BY m.stock_item_id,m.order_item_id LOOP
    state:=public.warehouse_return_state_v2(o.id,g.stock_item_id,g.order_item_id);
    result:=result||jsonb_build_array(jsonb_build_object('id',g.stock_item_id::text||':'||coalesce(g.order_item_id::text,'unassigned'),
      'orderItemId',g.order_item_id,'stockItemId',g.stock_item_id,'nome',g.name,'unita',g.unit,'quantita',g.expected,
      'usciti',(state->>'issued')::numeric,'posati',(state->>'used')::numeric,'rientrati',(state->>'returned')::numeric,
      'avanzano',(state->>'remaining')::numeric,'warehouseId',g.warehouse_id,'daGiacenza',true,'trackingMode',g.tracking_mode,
      'serials',state->'serials','verified',true,'protocolVersion',2,'blocked',CASE
        WHEN g.order_item_id IS NOT NULL AND g.line_stock_item_id IS DISTINCT FROM g.stock_item_id THEN 'La riga è stata associata a un altro articolo: verifica la provenienza.'
        WHEN public.unita_confrontabile(g.unit)<>public.unita_confrontabile(g.stock_unit) THEN 'Unità di misura diverse: verifica la riga prima del reso.'
        WHEN public.unita_confrontabile(g.unit)='a corpo' THEN 'Verifica i singoli prodotti della riga a corpo.'
        WHEN (state->>'remaining')::numeric<=0 THEN 'Nessun residuo da rendere.'
        WHEN g.tracking_mode='serialized' AND jsonb_array_length(state->'serials')=0 THEN 'Seriali storici senza uscita tracciata: verifica la provenienza.' ELSE NULL END));
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_return_candidates_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_return_candidates_v2(uuid) TO authenticated;

-- Compatibilità installazione: fungibili misurabili, senza scarichi anonimi di matricole.
CREATE OR REPLACE FUNCTION public.trg_auto_deduct_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stock public.warehouse_stock%ROWTYPE;
  v_company uuid;
  v_used numeric := 0;
  v_remaining numeric;
BEGIN
  IF NEW.status = 'installato' AND OLD.status IS DISTINCT FROM 'installato'
     AND NEW.auto_deducted IS NOT TRUE AND NEW.stock_item_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.orders WHERE id=NEW.order_id;
    SELECT * INTO v_stock FROM public.warehouse_stock
      WHERE id=NEW.stock_item_id AND company_id=v_company FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Articolo di magazzino non valido per questa commessa'; END IF;
    IF NEW.quantity IS NULL OR NEW.quantity<=0 OR NEW.quantity::text IN ('NaN','Infinity','-Infinity') OR ((v_stock.tracking_mode='serialized' OR public.unita_confrontabile(v_stock.unita_misura)='pz') AND NEW.quantity<>trunc(NEW.quantity)) THEN
      RAISE EXCEPTION 'Verifica la quantità e l’unità dello scarico automatico';
    END IF;
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    PERFORM public.magazzino_collega_prelievi(v_company, NEW.order_id, NEW.id, NEW.stock_item_id,
                                              greatest(NEW.quantity - greatest(v_used, 0), 0));
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    v_remaining := greatest(NEW.quantity-greatest(v_used,0),0);
    IF v_remaining>0 AND v_stock.tracking_mode='serialized' THEN RAISE EXCEPTION 'Preleva prima i seriali e poi registra l’installazione.' USING ERRCODE='PT409'; END IF;
    IF v_remaining>0 THEN
      IF v_stock.quantity<v_remaining THEN
        RAISE EXCEPTION 'Giacenza insufficiente: disponibili %, da scaricare %', v_stock.quantity,v_remaining;
      END IF;
      UPDATE public.warehouse_stock SET quantity=quantity-v_remaining,updated_at=now()
        WHERE id=NEW.stock_item_id AND company_id=v_company;
      INSERT INTO public.warehouse_movements
        (stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,order_id,company_id,warehouse_id,unit_cost)
      VALUES (NEW.stock_item_id,NEW.id,'scarico',v_remaining,'Scarico residuo automatico a installazione',
        auth.uid(),NEW.order_id,v_company,v_stock.warehouse_id,v_stock.unit_cost);
    END IF;
    NEW.auto_deducted := true;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_auto_deduct_stock() FROM PUBLIC,anon,authenticated;

-- Carico interamente atomico; identità della richiesta e delle singole scansioni.
CREATE OR REPLACE FUNCTION public.warehouse_register_carico_v2(
  p_warehouse_id uuid,p_supplier_id uuid,p_scans jsonb,p_request_id uuid,
  p_ddt_ricezione_id uuid DEFAULT NULL,p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company uuid; replay jsonb; result jsonb; scan jsonb; item public.warehouse_stock;
  qty numeric; price numeric; section uuid; offline uuid; serials jsonb; serial text;
  n integer:=0; units integer:=0;
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
  replay:=public.warehouse_claim_v2(company,p_request_id,'carico',jsonb_build_object('warehouse',p_warehouse_id,'supplier',p_supplier_id,'scans',p_scans,'ddt',p_ddt_ricezione_id,'notes',p_notes));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM id FROM public.warehouse_stock WHERE company_id=company AND id IN
    (SELECT (s->>'stock_item_id')::uuid FROM jsonb_array_elements(p_scans) s) ORDER BY id FOR UPDATE;
  FOR scan IN SELECT * FROM jsonb_array_elements(p_scans) LOOP
    SELECT * INTO item FROM public.warehouse_stock WHERE id=(scan->>'stock_item_id')::uuid AND company_id=company
      AND (warehouse_id=p_warehouse_id OR warehouse_id IS NULL);
    IF item.id IS NULL THEN RAISE EXCEPTION 'Articolo non presente nel magazzino scelto.' USING ERRCODE='P0002'; END IF;
    qty:=(scan->>'quantity')::numeric; price:=nullif(scan->>'unit_price','')::numeric;
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
  result:=jsonb_build_object('created_movements',n,'created_units',units,'updated_items',n,'errors','[]'::jsonb);
  UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=company AND request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_register_carico_v2(uuid,uuid,jsonb,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_register_carico_v2(uuid,uuid,jsonb,uuid,uuid,text) TO authenticated;

-- Un prelievo senza riga che è stato reso in parte si collega per il netto:
-- si spostano insieme uscita e rientri allocati, senza perdere lo storno.
CREATE OR REPLACE FUNCTION public.magazzino_collega_prelievi(p_company uuid,p_commessa uuid,p_riga uuid,p_articolo uuid,p_quanto numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE remaining numeric:=greatest(coalesce(p_quanto,0),0); linked numeric:=0; returned numeric; net numeric; legacy numeric; m public.warehouse_movements;
BEGIN
  IF p_riga IS NULL OR p_articolo IS NULL OR p_commessa IS NULL OR remaining<=0 THEN RETURN 0; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE id=p_riga AND order_id=p_commessa AND stock_item_id=p_articolo) THEN
    RAISE EXCEPTION 'Riga non coerente con il prelievo.' USING ERRCODE='PT409'; END IF;
  SELECT coalesce(sum(quantity),0) INTO legacy FROM public.warehouse_movements
    WHERE company_id=p_company AND order_id=p_commessa AND stock_item_id=p_articolo AND order_item_id IS NULL
      AND movement_type='carico' AND rientro_commessa AND coalesce(notes,'') NOT LIKE 'Divisione tra le fasi:%';
  SELECT legacy-coalesce(sum(a.quantity),0) INTO legacy FROM public.warehouse_return_allocations a
    JOIN public.warehouse_movements r ON r.id=a.return_movement_id
    WHERE r.company_id=p_company AND r.order_id=p_commessa AND r.stock_item_id=p_articolo AND r.order_item_id IS NULL;
  IF legacy>0 THEN RAISE EXCEPTION 'Resi storici senza origine: verifica il collegamento prima dell’installazione.' USING ERRCODE='PT409'; END IF;
  FOR m IN SELECT * FROM public.warehouse_movements WHERE company_id=p_company AND order_id=p_commessa
    AND stock_item_id=p_articolo AND order_item_id IS NULL AND movement_type='scarico'
    AND coalesce(notes,'') NOT LIKE 'Divisione tra le fasi:%' ORDER BY created_at,id FOR UPDATE LOOP
    EXIT WHEN remaining<=0;
    SELECT coalesce(sum(quantity),0) INTO returned FROM public.warehouse_return_allocations WHERE outbound_movement_id=m.id;
    net:=m.quantity-returned;
    IF net<=0 THEN CONTINUE; END IF;
    IF returned>0 AND net>remaining THEN
      RAISE EXCEPTION 'Prelievo già reso in parte: collega l’intero residuo a una riga coerente prima dell’installazione.' USING ERRCODE='PT409'; END IF;
    IF net<=remaining THEN
      UPDATE public.warehouse_movements SET order_item_id=p_riga,da_prelievo=true WHERE id=m.id;
      UPDATE public.warehouse_movements r SET order_item_id=p_riga WHERE id IN
        (SELECT return_movement_id FROM public.warehouse_return_allocations WHERE outbound_movement_id=m.id);
      UPDATE public.stock_units u SET delivered_order_item_id=p_riga WHERE id IN
        (SELECT stock_unit_id FROM public.warehouse_unit_exits WHERE movement_id=m.id AND returned_by IS NULL) AND u.status='shipped';
      remaining:=remaining-net; linked:=linked+net;
    ELSE
      INSERT INTO public.warehouse_movements(stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,created_at,order_id,
        lot_number,unit_cost,company_id,warehouse_id,uscita_id,rientro_commessa,da_prelievo,valorizza_medio,costo_provvisorio)
        VALUES(m.stock_item_id,NULL,m.movement_type,m.quantity-remaining,m.notes,m.performed_by,m.created_at,m.order_id,
          m.lot_number,m.unit_cost,m.company_id,m.warehouse_id,m.uscita_id,m.rientro_commessa,false,m.valorizza_medio,m.costo_provvisorio);
      UPDATE public.warehouse_movements SET quantity=remaining,order_item_id=p_riga,da_prelievo=true WHERE id=m.id;
      linked:=linked+remaining; remaining:=0;
    END IF;
  END LOOP;
  RETURN linked;
END $$;
REVOKE ALL ON FUNCTION public.magazzino_collega_prelievi(uuid,uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
