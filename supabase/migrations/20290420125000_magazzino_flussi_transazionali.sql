BEGIN;
SET LOCAL lock_timeout = '3s';

-- magazzino-p2-transazioni.sql
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

-- magazzino-p3-operazioni.sql
-- SOLO LOCALE: non inserire in supabase/migrations, non applicare online.
SET lock_timeout='3s';
SET statement_timeout='60s';
-- Gli amministratori sono qualificati per azienda come nella funzione live
-- has_permission_for_company. Gli altri operatori devono essere assegnati.
CREATE OR REPLACE FUNCTION public.warehouse_location_allowed_v3(p_company uuid,p_warehouse uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse AND company_id=p_company AND is_active) AND (
  coalesce(public.e_super_admin_dentro(p_company),false)
  OR (public.has_role(auth.uid(),'company_admin'::public.app_role) AND public.get_user_company_id(auth.uid())=p_company)
  OR EXISTS(SELECT 1 FROM public.multi_company_access m WHERE m.user_id=auth.uid() AND m.company_id=p_company AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now()) AND m.access_role::text='company_admin')
  OR EXISTS(SELECT 1 FROM public.warehouse_assignments a WHERE a.warehouse_id=p_warehouse AND a.user_id=auth.uid() AND a.active)
 )
$$;
REVOKE ALL ON FUNCTION public.warehouse_location_allowed_v3(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.warehouse_location_access_v3(p_company uuid,p_warehouse uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT coalesce(public.warehouse_location_allowed_v3(p_company,p_warehouse),false) THEN RAISE EXCEPTION 'Non sei assegnato a questo magazzino.' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_location_access_v3(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.warehouse_transfer_links_v3 (
 company_id uuid NOT NULL REFERENCES public.companies(id), source_stock_id uuid NOT NULL REFERENCES public.warehouse_stock(id),
 destination_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id), destination_stock_id uuid NOT NULL REFERENCES public.warehouse_stock(id),
 PRIMARY KEY(company_id,source_stock_id,destination_warehouse_id), UNIQUE(destination_stock_id)
);
CREATE TABLE IF NOT EXISTS public.warehouse_stock_identity_v3(stock_item_id uuid PRIMARY KEY REFERENCES public.warehouse_stock(id),root_stock_id uuid NOT NULL REFERENCES public.warehouse_stock(id),company_id uuid NOT NULL REFERENCES public.companies(id));
ALTER TABLE public.warehouse_stock_identity_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_stock_identity_v3 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.warehouse_transfer_items ADD COLUMN IF NOT EXISTS destination_stock_item_id uuid REFERENCES public.warehouse_stock(id);
ALTER TABLE public.warehouse_transfer_items ADD COLUMN IF NOT EXISTS serial_numbers jsonb;
CREATE TABLE IF NOT EXISTS public.warehouse_inventory_counts_v3 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),stock_item_id uuid NOT NULL REFERENCES public.warehouse_stock(id),
 expected_quantity numeric NOT NULL,counted_quantity numeric NOT NULL CHECK(counted_quantity>=0),
 difference numeric GENERATED ALWAYS AS(counted_quantity-expected_quantity) STORED,
 snapshot jsonb NOT NULL,serial_numbers jsonb,adjustment_applied boolean NOT NULL DEFAULT false,
 performed_by uuid NOT NULL,notes text,created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz
);
ALTER TABLE public.warehouse_transfer_links_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_inventory_counts_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_transfer_links_v3,public.warehouse_inventory_counts_v3 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.stock_units DROP CONSTRAINT IF EXISTS stock_units_status_check;
ALTER TABLE public.stock_units ADD CONSTRAINT stock_units_status_check CHECK(status IN ('available','reserved','shipped','installed','returned','defective','scrapped','inventory_missing'));

CREATE OR REPLACE FUNCTION public.warehouse_transfer_v3(p_company_id uuid,p_from_warehouse_id uuid,p_to_warehouse_id uuid,p_transfer_date date,p_notes text,p_items jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE replay jsonb; result jsonb; src public.warehouse_stock; dst public.warehouse_stock; unit public.stock_units;
 row jsonb; qty numeric; root_id uuid; tid uuid:=gen_random_uuid(); dest uuid; serial text; idx integer:=0; from_name text; to_name text;
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_edit_warehouse');
 IF p_from_warehouse_id IS NULL OR p_to_warehouse_id IS NULL OR p_from_warehouse_id=p_to_warehouse_id THEN
   RAISE EXCEPTION 'Scegli due magazzini diversi.' USING ERRCODE='22023'; END IF;
 SELECT name INTO from_name FROM public.warehouses WHERE id=p_from_warehouse_id AND company_id=p_company_id AND is_active;
 SELECT name INTO to_name FROM public.warehouses WHERE id=p_to_warehouse_id AND company_id=p_company_id AND is_active;
 PERFORM public.warehouse_location_access_v3(p_company_id,p_from_warehouse_id);
 PERFORM public.warehouse_location_access_v3(p_company_id,p_to_warehouse_id);
 IF from_name IS NULL OR to_name IS NULL THEN RAISE EXCEPTION 'Magazzino non accessibile.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>500 THEN
   RAISE EXCEPTION 'Aggiungi almeno un articolo.' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT v->>'stock_item_id') FROM jsonb_array_elements(p_items) v)<>jsonb_array_length(p_items) THEN
   RAISE EXCEPTION 'Un articolo può comparire una sola volta nel trasferimento.' USING ERRCODE='22023'; END IF;
 replay:=public.warehouse_claim_v2(p_company_id,p_request_id,'transfer',jsonb_build_object('from',p_from_warehouse_id,'to',p_to_warehouse_id,'date',p_transfer_date,'notes',p_notes,'items',p_items));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 -- Unisce anche i trasferimenti incrociati e la creazione delle schede destinazione.
 PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-transfer-v3:'||p_company_id::text,0));
 PERFORM s.id FROM public.warehouse_stock s WHERE s.company_id=p_company_id AND (s.id IN (SELECT (v->>'stock_item_id')::uuid FROM jsonb_array_elements(p_items) v)
   OR s.id IN (SELECT l.destination_stock_id FROM public.warehouse_transfer_links_v3 l JOIN jsonb_array_elements(p_items) v ON l.source_stock_id=coalesce((SELECT root_stock_id FROM public.warehouse_stock_identity_v3 WHERE stock_item_id=(v->>'stock_item_id')::uuid),(v->>'stock_item_id')::uuid) WHERE l.company_id=p_company_id AND l.destination_warehouse_id=p_to_warehouse_id)) ORDER BY s.id FOR UPDATE;
 INSERT INTO public.warehouse_transfers(id,company_id,from_warehouse_id,to_warehouse_id,status,transfer_date,notes,created_by)
 VALUES(tid,p_company_id,p_from_warehouse_id,p_to_warehouse_id,'ricevuto',coalesce(p_transfer_date,current_date),p_notes,auth.uid());
 FOR row IN SELECT * FROM jsonb_array_elements(p_items) LOOP
   SELECT * INTO src FROM public.warehouse_stock WHERE id=(row->>'stock_item_id')::uuid AND warehouse_id=p_from_warehouse_id AND company_id=p_company_id;
   qty:=(row->>'quantity')::numeric;
   IF src.id IS NULL THEN RAISE EXCEPTION 'Articolo non presente nel magazzino di partenza.' USING ERRCODE='P0002'; END IF;
   IF qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<=0 THEN RAISE EXCEPTION 'Quantità non valida.' USING ERRCODE='22023'; END IF;
   IF (src.tracking_mode='serialized' OR public.unita_confrontabile(src.unita_misura)='pz') AND qty<>trunc(qty) THEN
     RAISE EXCEPTION 'Per questo articolo servono unità intere.' USING ERRCODE='22023'; END IF;
   IF qty>src.quantity_available THEN RAISE EXCEPTION 'Disponibile cambiato per %: utilizzabili %, richiesti %.',src.name,src.quantity_available,qty USING ERRCODE='PT409'; END IF;
   INSERT INTO public.warehouse_stock_identity_v3 VALUES(src.id,src.id,p_company_id) ON CONFLICT DO NOTHING;
   SELECT root_stock_id INTO root_id FROM public.warehouse_stock_identity_v3 WHERE stock_item_id=src.id AND company_id=p_company_id;
   INSERT INTO public.warehouse_transfer_links_v3 VALUES(p_company_id,root_id,src.warehouse_id,src.id) ON CONFLICT DO NOTHING;
   SELECT destination_stock_id INTO dest FROM public.warehouse_transfer_links_v3 WHERE company_id=p_company_id AND source_stock_id=root_id AND destination_warehouse_id=p_to_warehouse_id;
   IF dest IS NULL THEN
     -- Nessun abbinamento per nome; la provenienza rimane esplicita. Codici
     -- univoci aziendali e ubicazione non vengono duplicati in un altro deposito.
     INSERT INTO public.warehouse_stock(company_id,warehouse_id,name,description,quantity,unit_cost,vat_rate,supplier_id,min_stock_level,tracking_mode,requires_warranty,default_warranty_months,unita_misura,article_family_id,prezzo_da_definire)
     VALUES(p_company_id,p_to_warehouse_id,src.name,src.description,0,src.unit_cost,src.vat_rate,src.supplier_id,0,src.tracking_mode,src.requires_warranty,src.default_warranty_months,src.unita_misura,src.article_family_id,src.prezzo_da_definire) RETURNING id INTO dest;
     INSERT INTO public.warehouse_transfer_links_v3 VALUES(p_company_id,root_id,p_to_warehouse_id,dest);
     INSERT INTO public.warehouse_stock_identity_v3 VALUES(dest,root_id,p_company_id);
   END IF;
   SELECT * INTO dst FROM public.warehouse_stock WHERE id=dest AND company_id=p_company_id AND warehouse_id=p_to_warehouse_id;
   IF dst.id IS NULL OR dst.tracking_mode<>src.tracking_mode OR public.unita_confrontabile(dst.unita_misura)<>public.unita_confrontabile(src.unita_misura) THEN
     RAISE EXCEPTION 'Scheda di destinazione non coerente: verifica la provenienza.' USING ERRCODE='PT409'; END IF;
   IF src.tracking_mode='serialized' THEN
     IF jsonb_typeof(row->'serial_numbers') IS DISTINCT FROM 'array' OR jsonb_array_length(row->'serial_numbers')<>qty OR
       (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(row->'serial_numbers'))<>qty THEN
       RAISE EXCEPTION 'Scegli un seriale distinto per ogni pezzo.' USING ERRCODE='22023'; END IF;
     PERFORM id FROM public.stock_units WHERE stock_item_id=src.id ORDER BY id FOR UPDATE;
     FOR serial IN SELECT jsonb_array_elements_text(row->'serial_numbers') LOOP
       SELECT * INTO unit FROM public.stock_units WHERE company_id=p_company_id AND stock_item_id=src.id AND warehouse_id=p_from_warehouse_id AND serial_number=serial;
       IF unit.id IS NULL OR unit.status<>'available' THEN RAISE EXCEPTION 'Seriale % non disponibile per il trasferimento.',serial USING ERRCODE='PT409'; END IF;
       UPDATE public.stock_units SET stock_item_id=dest,warehouse_id=p_to_warehouse_id,section_id=NULL,updated_at=now() WHERE id=unit.id;
     END LOOP;
   ELSIF coalesce(row->'serial_numbers','[]'::jsonb) NOT IN ('[]'::jsonb,'null'::jsonb) THEN
     RAISE EXCEPTION 'Articolo senza matricole: rimuovi i seriali.' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.warehouse_movements(stock_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,unit_cost,costo_provvisorio)
   VALUES(src.id,'scarico',qty,'Trasferimento verso '||to_name,auth.uid(),p_company_id,p_from_warehouse_id,src.unit_cost,src.prezzo_da_definire),
     (dest,'carico',qty,'Trasferimento da '||from_name,auth.uid(),p_company_id,p_to_warehouse_id,src.unit_cost,src.prezzo_da_definire);
   UPDATE public.warehouse_stock SET quantity=quantity-qty,updated_at=now() WHERE id=src.id;
   UPDATE public.warehouse_stock SET quantity=quantity+qty,updated_at=now() WHERE id=dest;
   INSERT INTO public.warehouse_transfer_items(transfer_id,stock_item_id,destination_stock_item_id,quantity,quantity_received,sort_order,serial_numbers)
   VALUES(tid,src.id,dest,qty,qty,idx,row->'serial_numbers');
   idx:=idx+1;
 END LOOP;
 result:=jsonb_build_object('transfer_id',tid,'status','ricevuto','righe',idx);
 UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=p_company_id AND request_id=p_request_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_transfer_v3(uuid,uuid,uuid,date,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_transfer_v3(uuid,uuid,uuid,date,text,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_inventory_state_v3(p_stock uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('stock_item_id',s.id,'quantity',s.quantity,'reserved',s.quantity_reserved,'updated_at',s.updated_at,'unit',s.unita_misura,'tracking',s.tracking_mode,
 'serials',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'serial_number',u.serial_number,'status',u.status,'updated_at',u.updated_at) ORDER BY u.id)
   FROM public.stock_units u WHERE u.company_id=s.company_id AND u.stock_item_id=s.id AND u.warehouse_id=s.warehouse_id AND u.status IN ('available','reserved','inventory_missing')),'[]'::jsonb))
 FROM public.warehouse_stock s WHERE s.id=p_stock
$$;
REVOKE ALL ON FUNCTION public.warehouse_inventory_state_v3(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.warehouse_inventory_preview_v3(p_stock_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company uuid;
BEGIN
 SELECT company_id INTO company FROM public.warehouse_stock WHERE id=p_stock_item_id;
 PERFORM public.warehouse_access_v2(company,'can_view_warehouse');
 PERFORM public.warehouse_location_access_v3(company,(SELECT warehouse_id FROM public.warehouse_stock WHERE id=p_stock_item_id));
 RETURN public.warehouse_inventory_state_v3(p_stock_item_id);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_inventory_preview_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_preview_v3(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_inventory_count_v3(p_stock_item_id uuid,p_counted numeric,p_snapshot jsonb,p_serial_numbers jsonb,p_notes text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.warehouse_stock; state jsonb; replay jsonb; result jsonb; audit uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO s FROM public.warehouse_stock WHERE id=p_stock_item_id;
 PERFORM public.warehouse_access_v2(s.company_id,'can_edit_warehouse');
 PERFORM public.warehouse_location_access_v3(s.company_id,s.warehouse_id);
 replay:=public.warehouse_claim_v2(s.company_id,p_request_id,'inventory-count',jsonb_build_object('stock',p_stock_item_id,'counted',p_counted,'snapshot',p_snapshot,'serials',p_serial_numbers,'notes',p_notes));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO s FROM public.warehouse_stock WHERE id=p_stock_item_id FOR UPDATE;
 PERFORM id FROM public.stock_units WHERE stock_item_id=s.id ORDER BY id FOR UPDATE;
 state:=public.warehouse_inventory_state_v3(s.id);
 IF state IS DISTINCT FROM p_snapshot THEN RAISE EXCEPTION 'La giacenza è cambiata durante il conteggio. Aggiorna e riconta prima di salvare.' USING ERRCODE='PT409'; END IF;
 IF p_counted IS NULL OR p_counted::text IN ('NaN','Infinity','-Infinity') OR p_counted<0 OR
  ((s.tracking_mode='serialized' OR public.unita_confrontabile(s.unita_misura)='pz') AND p_counted<>trunc(p_counted)) THEN
  RAISE EXCEPTION 'Quantità conteggiata non valida per questo articolo.' USING ERRCODE='22023'; END IF;
 IF s.tracking_mode='serialized' THEN
   IF s.quantity<>(SELECT count(*) FROM jsonb_array_elements(state->'serials') u WHERE u->>'status' IN ('available','reserved')) THEN RAISE EXCEPTION 'Giacenza e matricole non coerenti: verifica le matricole registrate prima dell’inventario.' USING ERRCODE='PT409'; END IF;
   IF jsonb_typeof(p_serial_numbers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_serial_numbers)<>p_counted OR
    (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_serial_numbers))<>p_counted OR
    EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_serial_numbers) n WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'serials') u WHERE u->>'serial_number'=n.value)) THEN
    RAISE EXCEPTION 'Seleziona soltanto le matricole presenti nel deposito o da ritrovare.' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(state->'serials') u WHERE u->>'status'='reserved' AND NOT p_serial_numbers ? (u->>'serial_number')) THEN
    RAISE EXCEPTION 'Una matricola prenotata non può essere dichiarata mancante.' USING ERRCODE='PT409'; END IF;
 ELSE
   IF coalesce(p_serial_numbers,'[]'::jsonb) NOT IN ('[]'::jsonb,'null'::jsonb) THEN RAISE EXCEPTION 'Questo articolo non usa matricole.' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_counted<s.quantity_reserved THEN RAISE EXCEPTION 'Il conteggio è inferiore alla quantità prenotata: verifica prima gli impegni.' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.warehouse_inventory_counts_v3(id,company_id,stock_item_id,expected_quantity,counted_quantity,snapshot,serial_numbers,performed_by,notes)
 VALUES(audit,s.company_id,s.id,s.quantity,p_counted,state,p_serial_numbers,auth.uid(),p_notes);
 result:=jsonb_build_object('id',audit,'difference',p_counted-s.quantity,'adjustment_applied',false);
 UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=s.company_id AND request_id=p_request_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_inventory_count_v3(uuid,numeric,jsonb,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_count_v3(uuid,numeric,jsonb,jsonb,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_inventory_apply_v3(p_audit_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.warehouse_inventory_counts_v3;s public.warehouse_stock;u public.stock_units;replay jsonb;result jsonb;direction text;amount numeric;
BEGIN
 SELECT * INTO a FROM public.warehouse_inventory_counts_v3 WHERE id=p_audit_id;
 PERFORM public.warehouse_access_v2(a.company_id,'can_edit_warehouse');
 PERFORM public.warehouse_location_access_v3(a.company_id,(SELECT warehouse_id FROM public.warehouse_stock WHERE id=a.stock_item_id));
 replay:=public.warehouse_claim_v2(a.company_id,p_request_id,'inventory-apply',jsonb_build_object('audit',p_audit_id));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO a FROM public.warehouse_inventory_counts_v3 WHERE id=p_audit_id FOR UPDATE;
 IF NOT a.adjustment_applied THEN
   SELECT * INTO s FROM public.warehouse_stock WHERE id=a.stock_item_id AND company_id=a.company_id FOR UPDATE;
   PERFORM id FROM public.stock_units WHERE stock_item_id=s.id ORDER BY id FOR UPDATE;
   IF public.warehouse_inventory_state_v3(s.id) IS DISTINCT FROM a.snapshot THEN
     RAISE EXCEPTION 'Sono avvenuti movimenti dopo il conteggio. Registra un nuovo conteggio: nessuna rettifica applicata.' USING ERRCODE='PT409'; END IF;
   IF a.counted_quantity<s.quantity_reserved THEN RAISE EXCEPTION 'Quantità inferiore agli impegni: rettifica non applicata.' USING ERRCODE='PT409'; END IF;
   IF s.tracking_mode='serialized' THEN
     FOR u IN SELECT * FROM public.stock_units WHERE stock_item_id=s.id AND warehouse_id=s.warehouse_id AND status IN ('available','reserved','inventory_missing') ORDER BY id LOOP
       direction:=NULL;
       IF a.serial_numbers ? u.serial_number AND u.status='inventory_missing' THEN
         direction:='carico'; UPDATE public.stock_units SET status='available',updated_at=now() WHERE id=u.id;
       ELSIF NOT a.serial_numbers ? u.serial_number AND u.status='available' THEN
         direction:='scarico'; UPDATE public.stock_units SET status='inventory_missing',updated_at=now() WHERE id=u.id;
       END IF;
       IF direction IS NOT NULL THEN
         INSERT INTO public.warehouse_movements(stock_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,unit_cost)
         VALUES(s.id,direction,1,'Rettifica inventario · S/N '||u.serial_number,auth.uid(),s.company_id,s.warehouse_id,s.unit_cost);
       END IF;
     END LOOP;
   ELSIF a.difference<>0 THEN
     INSERT INTO public.warehouse_movements(stock_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,unit_cost)
     VALUES(s.id,CASE WHEN a.difference>0 THEN 'carico' ELSE 'scarico' END,abs(a.difference),'Rettifica inventario',auth.uid(),s.company_id,s.warehouse_id,s.unit_cost);
   END IF;
   UPDATE public.warehouse_stock SET quantity=a.counted_quantity,updated_at=now() WHERE id=s.id;
   UPDATE public.warehouse_inventory_counts_v3 SET adjustment_applied=true,applied_at=now() WHERE id=a.id;
 END IF;
 result:=jsonb_build_object('id',a.id,'adjustment_applied',true,'quantity',a.counted_quantity,'difference',a.difference);
 UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=a.company_id AND request_id=p_request_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_inventory_apply_v3(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_apply_v3(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_inventory_list_v3(p_company_id uuid,p_stock_item_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_view_warehouse');
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
   SELECT id,company_id,stock_item_id,expected_quantity,counted_quantity,difference,adjustment_applied,performed_by,notes,created_at,3 protocol_version
   FROM public.warehouse_inventory_counts_v3 WHERE company_id=p_company_id AND public.warehouse_location_allowed_v3(p_company_id,(SELECT warehouse_id FROM public.warehouse_stock WHERE id=stock_item_id)) AND (p_stock_item_id IS NULL OR stock_item_id=p_stock_item_id)
   UNION ALL
   SELECT id,company_id,stock_item_id,expected_quantity::numeric,counted_quantity::numeric,difference::numeric,adjustment_applied,performed_by,notes,created_at,1
   FROM public.inventory_audits WHERE company_id=p_company_id AND public.warehouse_location_allowed_v3(p_company_id,(SELECT warehouse_id FROM public.warehouse_stock WHERE id=stock_item_id)) AND (p_stock_item_id IS NULL OR stock_item_id=p_stock_item_id)
 ) x);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_inventory_list_v3(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_list_v3(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_reorder_preview_v3(p_company_id uuid,p_warehouse_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_view_warehouse');
 SELECT coalesce(jsonb_agg(jsonb_build_object('stockItemId',s.id,'name',s.name,'warehouseId',s.warehouse_id,'unit',s.unita_misura,'tracking',s.tracking_mode,
  'available',s.quantity_available,'reserved',s.quantity_reserved,'minLevel',s.min_stock_level,'incoming',incoming.qty,
  'deficit',greatest(s.min_stock_level-s.quantity_available-incoming.qty,0),
  'suggested',CASE WHEN s.min_stock_level<=s.quantity_available+incoming.qty THEN 0
   WHEN s.tracking_mode='serialized' OR public.unita_confrontabile(s.unita_misura)='pz' THEN ceil(greatest(s.min_stock_level-s.quantity_available-incoming.qty,s.reorder_quantity))
   ELSE greatest(s.min_stock_level-s.quantity_available-incoming.qty,s.reorder_quantity) END,
  'updatedAt',s.updated_at,'pricePending',s.prezzo_da_definire,'supplierId',s.supplier_id,'supplierName',v.name,'unitCost',CASE WHEN public.has_permission_for_company(auth.uid(),'can_view_costs',p_company_id) THEN s.unit_cost ELSE NULL END)
  ORDER BY s.name),'[]'::jsonb) INTO result FROM public.warehouse_stock s LEFT JOIN public.suppliers v ON v.id=s.supplier_id AND v.company_id=s.company_id
  CROSS JOIN LATERAL (SELECT coalesce(sum(greatest(i.quantity-i.quantity_received,0)),0) qty FROM public.purchase_order_items i JOIN public.purchase_orders o ON o.id=i.purchase_order_id
   WHERE i.stock_item_id=s.id AND i.company_id=p_company_id AND o.company_id=p_company_id AND o.status IN ('bozza','inviato','confermato','parziale')) incoming
 WHERE s.company_id=p_company_id AND public.warehouse_location_allowed_v3(p_company_id,s.warehouse_id) AND (p_warehouse_id IS NULL OR s.warehouse_id=p_warehouse_id) AND s.quantity_available<s.min_stock_level;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_reorder_preview_v3(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_reorder_preview_v3(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_reorder_v3(p_company_id uuid,p_supplier_id uuid,p_lines jsonb,p_warehouse_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE replay jsonb;result jsonb;row jsonb;s public.warehouse_stock;qty numeric;todo jsonb:='[]';existing jsonb:='[]';po uuid;code text;idx integer:=0;wh uuid;old_po record;
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_edit_warehouse');
 PERFORM public.warehouse_access_v2(p_company_id,'can_manage_purchasing');
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND company_id=p_company_id) THEN RAISE EXCEPTION 'Scegli un fornitore della tua azienda.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 OR jsonb_array_length(p_lines)>500 THEN RAISE EXCEPTION 'Aggiungi le quantità da riordinare.' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT v->>'stock_item_id') FROM jsonb_array_elements(p_lines) v)<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'Articolo ripetuto nel riordino.' USING ERRCODE='22023'; END IF;
 replay:=public.warehouse_claim_v2(p_company_id,p_request_id,'reorder',jsonb_build_object('supplier',p_supplier_id,'lines',p_lines,'warehouse',p_warehouse_id));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM id FROM public.warehouse_stock WHERE company_id=p_company_id AND id IN(SELECT (v->>'stock_item_id')::uuid FROM jsonb_array_elements(p_lines) v) ORDER BY id FOR UPDATE;
 FOR row IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
   qty:=(row->>'quantity')::numeric;
   IF qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<0 THEN RAISE EXCEPTION 'Quantità non valida.' USING ERRCODE='22023'; END IF;
   IF qty=0 THEN CONTINUE; END IF;
   SELECT * INTO s FROM public.warehouse_stock WHERE id=(row->>'stock_item_id')::uuid AND company_id=p_company_id;
   IF s.id IS NULL OR s.supplier_id IS DISTINCT FROM p_supplier_id THEN RAISE EXCEPTION 'Articolo e fornitore non coerenti.' USING ERRCODE='42501'; END IF;
   IF row ? 'expected_updated_at' AND (row->>'expected_updated_at')::timestamptz IS DISTINCT FROM s.updated_at THEN RAISE EXCEPTION 'La scheda è cambiata: aggiorna il riordino prima di confermare.' USING ERRCODE='PT409'; END IF;
   IF (s.tracking_mode='serialized' OR public.unita_confrontabile(s.unita_misura)='pz') AND qty<>trunc(qty) THEN RAISE EXCEPTION 'Per questo articolo ordina unità intere.' USING ERRCODE='22023'; END IF;
   PERFORM public.warehouse_location_access_v3(p_company_id,s.warehouse_id);
   IF public.unita_confrontabile(s.unita_misura)='a corpo' THEN RAISE EXCEPTION 'Il riordino richiede un’unità misurabile.' USING ERRCODE='22023'; END IF;
   IF p_warehouse_id IS NOT NULL AND s.warehouse_id IS DISTINCT FROM p_warehouse_id THEN RAISE EXCEPTION 'Gli articoli appartengono a magazzini diversi. Separa i riordini.' USING ERRCODE='22023'; END IF;
   IF wh IS NOT NULL AND wh IS DISTINCT FROM s.warehouse_id THEN RAISE EXCEPTION 'Separa il riordino per magazzino.' USING ERRCODE='22023'; END IF;
   wh:=s.warehouse_id;
   SELECT o.id,o.oda_number INTO old_po FROM public.purchase_order_items i JOIN public.purchase_orders o ON o.id=i.purchase_order_id
    WHERE i.company_id=p_company_id AND o.company_id=p_company_id AND i.stock_item_id=s.id AND o.status IN ('bozza','inviato','confermato','parziale') AND i.quantity>i.quantity_received ORDER BY o.created_at DESC LIMIT 1;
   IF FOUND THEN existing:=existing||jsonb_build_array(jsonb_build_object('stock_item_id',s.id,'nome',s.name,'oda_id',old_po.id,'oda_number',old_po.oda_number));CONTINUE; END IF;
   todo:=todo||jsonb_build_array(jsonb_build_object('id',s.id,'name',s.name,'qty',qty,'price',s.unit_cost,'vat',coalesce(s.vat_rate,22),'unit',coalesce(nullif(btrim(s.unita_misura),''),'pz'),'pending',s.prezzo_da_definire));
 END LOOP;
 IF jsonb_array_length(todo)>0 THEN
   IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=wh AND company_id=p_company_id AND is_active) THEN RAISE EXCEPTION 'Magazzino non accessibile.' USING ERRCODE='42501'; END IF;
   -- Lo stesso lock della numerazione canonica, anche con altre creazioni ODA.
   PERFORM pg_advisory_xact_lock(hashtextextended('operational-oda:'||p_company_id::text,0));
   INSERT INTO public.purchase_orders(company_id,supplier_id,order_id,delivery_warehouse_id,created_by,notes,origine,status)
    VALUES(p_company_id,p_supplier_id,NULL,wh,auth.uid(),'Riordino da sottoscorta magazzino','portale','bozza') RETURNING id,oda_number INTO po,code;
   FOR row IN SELECT * FROM jsonb_array_elements(todo) LOOP
     INSERT INTO public.purchase_order_items(company_id,purchase_order_id,stock_item_id,description,quantity,unit_price,vat_rate,unit_of_measure,sort_order,price_pending)
     VALUES(p_company_id,po,(row->>'id')::uuid,row->>'name',(row->>'qty')::numeric,(row->>'price')::numeric,(row->>'vat')::numeric,row->>'unit',idx,(row->>'pending')::boolean);
     idx:=idx+1;
   END LOOP;
 END IF;
 result:=jsonb_build_object('purchase_order_id',po,'oda_number',code,'righe',idx,'gia_in_ordine',existing);
 UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=p_company_id AND request_id=p_request_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_reorder_v3(uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_reorder_v3(uuid,uuid,jsonb,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_capabilities_v2(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_view_warehouse');
 RETURN jsonb_build_object('version',3,'atomic_reservations',true,'idempotent_carichi',true,'idempotent_uscite',true,'fractional_returns',true,'serial_returns',true,'atomic_import',true,'atomic_transfers',true,'inventory_counts',true,'reorder',true);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_capabilities_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_capabilities_v2(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_transfer_list_v3(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_view_warehouse');
 RETURN (SELECT coalesce(jsonb_agg(x.data ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
 SELECT to_jsonb(t)||jsonb_build_object('from_warehouse',jsonb_build_object('name',f.name),'to_warehouse',jsonb_build_object('name',d.name)) data,t.created_at
 FROM public.warehouse_transfers t JOIN public.warehouses f ON f.id=t.from_warehouse_id JOIN public.warehouses d ON d.id=t.to_warehouse_id
 WHERE t.company_id=p_company_id AND (public.warehouse_location_allowed_v3(p_company_id,t.from_warehouse_id) OR public.warehouse_location_allowed_v3(p_company_id,t.to_warehouse_id))
 ORDER BY t.created_at DESC LIMIT 100) x);
END $$;
REVOKE ALL ON FUNCTION public.warehouse_transfer_list_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_transfer_list_v3(uuid) TO authenticated;

-- Importazione con giacenza iniziale: anagrafica e carico si confermano insieme.
CREATE OR REPLACE FUNCTION public.warehouse_import_stock_v3(p_company_id uuid,p_warehouse_id uuid,p_items jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE replay jsonb; result jsonb; item jsonb; sid uuid; qty numeric; price numeric; minimum numeric; reorder numeric; unit text; scans jsonb:='[]'; inserted integer:=0;
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_edit_warehouse');
 PERFORM public.warehouse_location_access_v3(p_company_id,p_warehouse_id);
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>500 THEN RAISE EXCEPTION 'Importa da 1 a 500 righe per file.' USING ERRCODE='22023'; END IF;
 replay:=public.warehouse_claim_v2(p_company_id,p_request_id,'import',jsonb_build_object('warehouse',p_warehouse_id,'items',p_items));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
   qty:=coalesce((item->>'quantity')::numeric,0);price:=coalesce((item->>'unit_cost')::numeric,0);
   minimum:=coalesce((item->>'min_stock_level')::numeric,0);reorder:=coalesce((item->>'reorder_quantity')::numeric,0);
   unit:=coalesce(nullif(btrim(item->>'unita_misura'),''),'pz');
   IF nullif(btrim(item->>'name'),'') IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR price::text IN ('NaN','Infinity','-Infinity')
    OR minimum::text IN ('NaN','Infinity','-Infinity') OR reorder::text IN ('NaN','Infinity','-Infinity')
    OR qty<0 OR price<0 OR minimum<0 OR reorder<0 OR qty>2147483647 OR (public.unita_confrontabile(unit)='pz' AND qty<>trunc(qty)) THEN
    RAISE EXCEPTION 'Nome, quantità, costo o soglie non validi. Per i decimali indica l’unità di misura.' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.warehouse_stock(company_id,warehouse_id,name,description,quantity,unit_cost,min_stock_level,reorder_quantity,unita_misura,internal_code,barcode,tracking_mode,prezzo_da_definire)
   VALUES(p_company_id,p_warehouse_id,btrim(item->>'name'),nullif(item->>'description',''),0,price,minimum,reorder,unit,nullif(btrim(item->>'internal_code'),''),nullif(btrim(item->>'barcode'),''),'fungible',coalesce((item->>'prezzo_da_definire')::boolean,false)) RETURNING id INTO sid;
   IF qty>0 THEN scans:=scans||jsonb_build_array(jsonb_build_object('stock_item_id',sid,'quantity',qty,'unit_price',CASE WHEN coalesce((item->>'prezzo_da_definire')::boolean,false) THEN NULL ELSE price END,'offline_client_uuid',gen_random_uuid())); END IF;
   inserted:=inserted+1;
 END LOOP;
 IF jsonb_array_length(scans)>0 THEN PERFORM public.warehouse_register_carico_v2(p_warehouse_id,NULL,scans,gen_random_uuid(),NULL,'Giacenza iniziale da importazione'); END IF;
 result:=jsonb_build_object('inserted',inserted);
 UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=p_company_id AND request_id=p_request_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_import_stock_v3(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_import_stock_v3(uuid,uuid,jsonb,uuid) TO authenticated;

-- magazzino-p4-valorizzazione.sql
-- SOLO LOCALE: dopo P2 e P3. Non applicare online senza rilascio autorizzato.
SET lock_timeout='3s';
SET statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.wh_get_lotti_in_scadenza(p_company_id uuid DEFAULT NULL::uuid, p_days_ahead integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_oggi       date := current_date;
  v_limite     date;
  v_result     jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  PERFORM public.warehouse_access_v2(v_company_id,'can_view_warehouse');

  v_limite := v_oggi + p_days_ahead;

  WITH lotti AS (
    SELECT
      lb.id,
      lb.lot_number,
      lb.expiry_date,
      lb.quantity,
      lb.unit_cost,
      ws.name           AS articolo,
      ws.internal_code,
      s.name            AS fornitore,
      (lb.expiry_date - v_oggi)::int AS giorni_residui,
      CASE
        WHEN lb.expiry_date < v_oggi                           THEN 'scaduto'
        WHEN lb.expiry_date - v_oggi <= 7                      THEN 'urgente'
        WHEN lb.expiry_date - v_oggi <= 30                     THEN 'attenzione'
        ELSE 'ok'
      END AS severita
    FROM public.warehouse_lot_batches lb
    JOIN public.warehouse_stock ws ON ws.id = lb.stock_item_id
    LEFT JOIN public.suppliers s   ON s.id = lb.supplier_id
    WHERE lb.company_id = v_company_id
      AND public.warehouse_location_allowed_v2(v_company_id,ws.warehouse_id)
      AND lb.expiry_date IS NOT NULL
      AND lb.expiry_date <= v_limite
      AND lb.quantity > 0
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'days_ahead', p_days_ahead,
      'data_riferimento', v_oggi,
      'data_limite', v_limite,
      'generato_il', now()
    ),
    'kpi', jsonb_build_object(
      'totale',     count(*),
      'scaduti',    count(*) FILTER (WHERE severita = 'scaduto'),
      'urgenti',    count(*) FILTER (WHERE severita = 'urgente'),
      'attenzione', count(*) FILTER (WHERE severita = 'attenzione'),
      'valore_a_rischio', CASE WHEN public.has_permission_for_company(auth.uid(),'can_view_costs',v_company_id) THEN COALESCE(sum(quantity * COALESCE(unit_cost,0)),0) ELSE NULL END
    ),
    'lotti', COALESCE(jsonb_agg(jsonb_build_object(
      'id',             id,
      'lot_number',     lot_number,
      'articolo',       articolo,
      'internal_code',  internal_code,
      'fornitore',      fornitore,
      'expiry_date',    expiry_date,
      'giorni_residui', giorni_residui,
      'quantity',       quantity,
      'unit_cost',      CASE WHEN public.has_permission_for_company(auth.uid(),'can_view_costs',v_company_id) THEN unit_cost ELSE NULL END,
      'valore',         CASE WHEN public.has_permission_for_company(auth.uid(),'can_view_costs',v_company_id) THEN quantity * COALESCE(unit_cost,0) ELSE NULL END,
      'severita',       severita
    ) ORDER BY expiry_date ASC), '[]'::jsonb)
  ) INTO v_result
  FROM lotti;

  RETURN v_result;
END;
$function$
;
REVOKE ALL ON FUNCTION public.wh_get_lotti_in_scadenza(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wh_get_lotti_in_scadenza(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.wh_get_valorizzazione(p_company_id uuid DEFAULT NULL::uuid, p_method text DEFAULT 'media'::text, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result     jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  PERFORM public.warehouse_access_v2(v_company_id,'can_view_warehouse');
  PERFORM public.warehouse_access_v2(v_company_id,'can_view_costs');

  IF p_method NOT IN ('media','fifo','lifo') THEN
    RAISE EXCEPTION 'Metodo non valido: %. Usare media, fifo o lifo.', p_method;
  END IF;

  -- Per ogni stock item:
  --   • COSTO MEDIO PONDERATO = sum(qty*cost) / sum(qty) sui lotti
  --   • FIFO = costi dei layer più vecchi che coprono la quantità totale
  --   • LIFO = costi dei layer più nuovi
  --
  -- Se non ci sono lotti, usa warehouse_stock.unit_cost come fallback.
  WITH stock_items AS (
    SELECT ws.id, ws.name, ws.internal_code, ws.unita_misura, ws.quantity AS qty_attuale,
           ws.unit_cost AS unit_cost_fallback,
           ws.warehouse_id,ws.prezzo_da_definire
    FROM public.warehouse_stock ws
    WHERE ws.company_id = v_company_id
      AND public.warehouse_location_allowed_v2(v_company_id,ws.warehouse_id)
      AND (p_warehouse_id IS NULL OR ws.warehouse_id = p_warehouse_id)
  ),
  -- Lotti con quantity > 0 (residui in magazzino)
  lotti_disponibili AS (
    SELECT lb.stock_item_id, lb.received_date, lb.quantity, lb.unit_cost,
           lb.lot_number
    FROM public.warehouse_lot_batches lb
    WHERE lb.company_id = v_company_id
      AND lb.quantity > 0
      AND lb.unit_cost IS NOT NULL
  ),
  -- Calcolo costo medio ponderato per item
  media_per_item AS (
    SELECT stock_item_id,
           sum(quantity * unit_cost) / NULLIF(sum(quantity), 0) AS costo_medio,
           sum(quantity) AS qty_lotti
    FROM lotti_disponibili
    GROUP BY stock_item_id
  ),
  -- Per FIFO: lotti ordinati dal più vecchio al più recente
  -- Per LIFO: lotti ordinati dal più recente al più vecchio
  lotti_ordered AS (
    SELECT
      l.stock_item_id, l.received_date, l.quantity, l.unit_cost,
      ROW_NUMBER() OVER (
        PARTITION BY l.stock_item_id
        ORDER BY CASE WHEN p_method = 'fifo' THEN l.received_date END ASC,
                 CASE WHEN p_method = 'lifo' THEN l.received_date END DESC
      ) AS rn,
      sum(l.quantity) OVER (
        PARTITION BY l.stock_item_id
        ORDER BY CASE WHEN p_method = 'fifo' THEN l.received_date END ASC,
                 CASE WHEN p_method = 'lifo' THEN l.received_date END DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS qty_cumulativa
    FROM lotti_disponibili l
  ),
  -- Per ogni stock item con metodo FIFO/LIFO, prendiamo i layer fino a coprire qty_attuale
  valore_fifo_lifo AS (
    SELECT
      lo.stock_item_id,
      sum(
        CASE
          -- Layer completo se non abbiamo ancora coperto la qty richiesta
          WHEN lo.qty_cumulativa <= si.qty_attuale THEN lo.quantity * lo.unit_cost
          -- Layer parziale: prendi solo la parte che ci serve
          WHEN lo.qty_cumulativa - lo.quantity < si.qty_attuale THEN
            (si.qty_attuale - (lo.qty_cumulativa - lo.quantity)) * lo.unit_cost
          ELSE 0
        END
      ) AS valore,
      sum(CASE WHEN lo.qty_cumulativa <= si.qty_attuale THEN lo.quantity
               WHEN lo.qty_cumulativa - lo.quantity < si.qty_attuale THEN si.qty_attuale - (lo.qty_cumulativa - lo.quantity)
               ELSE 0 END) AS qty_coperta
    FROM lotti_ordered lo
    JOIN stock_items si ON si.id = lo.stock_item_id
    WHERE p_method IN ('fifo','lifo')
    GROUP BY lo.stock_item_id
  ),
  -- Risultato finale per item
  per_item AS (
    SELECT
      si.id, si.name, si.internal_code, si.unita_misura, si.qty_attuale, si.warehouse_id,si.prezzo_da_definire,
      CASE
        WHEN p_method = 'media' AND mpi.costo_medio IS NOT NULL THEN
          least(si.qty_attuale,mpi.qty_lotti) * mpi.costo_medio + greatest(si.qty_attuale-mpi.qty_lotti,0) * coalesce(si.unit_cost_fallback,0)
        WHEN p_method IN ('fifo','lifo') AND vfl.valore IS NOT NULL THEN
          vfl.valore + greatest(si.qty_attuale - vfl.qty_coperta,0) * coalesce(si.unit_cost_fallback,0)
        ELSE
          si.qty_attuale * COALESCE(si.unit_cost_fallback, 0)
      END AS valore_calc,
      CASE
        WHEN p_method = 'media' AND mpi.costo_medio IS NOT NULL AND si.qty_attuale>0 THEN (least(si.qty_attuale,mpi.qty_lotti) * mpi.costo_medio + greatest(si.qty_attuale-mpi.qty_lotti,0) * coalesce(si.unit_cost_fallback,0))/si.qty_attuale
        WHEN p_method IN ('fifo','lifo') AND vfl.valore IS NOT NULL AND si.qty_attuale > 0 THEN
          (vfl.valore + greatest(si.qty_attuale - vfl.qty_coperta,0) * coalesce(si.unit_cost_fallback,0)) / si.qty_attuale
        ELSE COALESCE(si.unit_cost_fallback, 0)
      END AS unit_cost_calc,
      (mpi.costo_medio IS NOT NULL OR vfl.valore IS NOT NULL) AS ha_lotti,
      coalesce(mpi.qty_lotti,0)>0 AND coalesce(mpi.qty_lotti,0)<si.qty_attuale AS copertura_lotti_incompleta
    FROM stock_items si
    LEFT JOIN media_per_item mpi ON mpi.stock_item_id = si.id
    LEFT JOIN valore_fifo_lifo vfl ON vfl.stock_item_id = si.id
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'method',     p_method,
      'warehouse_id', p_warehouse_id,
      'generato_il', now()
    ),
    'kpi', jsonb_build_object(
      'valore_totale',  COALESCE(sum(valore_calc), 0),
      'n_articoli',     count(*) FILTER (WHERE qty_attuale>0),
      'n_articoli_con_lotti', count(*) FILTER (WHERE ha_lotti AND qty_attuale>0),
      'qty_totale',     COALESCE(sum(qty_attuale), 0)
    ),
    'articoli', COALESCE(jsonb_agg(jsonb_build_object(
      'id',            id,
      'name',          name,
      'internal_code', internal_code,
      'quantity',      qty_attuale,
      'unita_misura', unita_misura,
      'unit_cost',     round(unit_cost_calc::numeric, 2),
      'valore',        round(valore_calc::numeric, 2),
      'ha_lotti',      ha_lotti,
      'prezzo_da_definire',prezzo_da_definire,
      'copertura_lotti_incompleta',copertura_lotti_incompleta,
      'warehouse_id',  warehouse_id
    ) ORDER BY valore_calc DESC NULLS LAST), '[]'::jsonb)
  ) INTO v_result
  FROM per_item;

  RETURN v_result;
END;
$function$
;
REVOKE ALL ON FUNCTION public.wh_get_valorizzazione(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wh_get_valorizzazione(uuid,text,uuid) TO authenticated;

-- magazzino-p5-ricezioni-ddt.sql
-- SOLO LOCALE: proposta da revisionare, non applicare online. Richiede P2/P3.
SET lock_timeout='3s';
SET statement_timeout='60s';
-- Le scansioni e le ricezioni documentali concorrono allo stesso residuo ODA.
CREATE TABLE IF NOT EXISTS public.warehouse_oda_scan_receipts_v3(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),
 purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
 purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
 order_item_id uuid NOT NULL REFERENCES public.order_items(id),quantity_received numeric NOT NULL CHECK(quantity_received>0),receipt_date date NOT NULL DEFAULT current_date);
CREATE INDEX IF NOT EXISTS warehouse_oda_scan_receipts_position_idx ON public.warehouse_oda_scan_receipts_v3(purchase_order_id,order_item_id);
ALTER TABLE public.warehouse_oda_scan_receipts_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_oda_scan_receipts_v3 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_ddt_from_uscita(p_uscita_id uuid, p_ddt_extra jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(documento_id uuid, numero_ddt text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_u public.warehouse_uscite%ROWTYPE;
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_numero_ddt text; v_progressivo integer; v_documento_id uuid;
  v_indirizzo text;
  v_causale text;
  v_snapshot jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company context'; END IF;
  IF NOT public.puo_gestire_documento_fiscale(v_company_id, 'ddt') THEN
    RAISE EXCEPTION 'Non hai il permesso di creare DDT (servono magazzino, commesse o «Fatturazione»).' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_u FROM public.warehouse_uscite WHERE id = p_uscita_id AND company_id = v_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uscita non trovata'; END IF;
  -- Il solo permesso di consultare il magazzino non autorizza a creare documenti.
  IF NOT (coalesce(public.has_permission_for_company(auth.uid(),'can_edit_warehouse',v_company_id),false)
      OR coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',v_company_id),false)
      OR coalesce(public.has_permission_for_company(auth.uid(),'can_view_billing',v_company_id),false)
      OR coalesce(public.user_can_write_accountant_company(v_company_id),false)
      OR coalesce(public.e_super_admin_dentro(v_company_id),false)) THEN
    RAISE EXCEPTION 'Non hai il permesso di creare DDT.' USING ERRCODE='42501';
  END IF;
  IF NOT (coalesce(public.has_permission_for_company(auth.uid(),'can_view_billing',v_company_id),false)
      OR coalesce(public.user_can_write_accountant_company(v_company_id),false)) THEN
    PERFORM public.warehouse_location_access_v3(v_company_id,v_u.warehouse_id);
  END IF;
  IF v_u.documento_id IS NOT NULL THEN
    RETURN QUERY SELECT v_u.documento_id, (SELECT numero FROM public.documenti_fiscali WHERE id = v_u.documento_id);
    RETURN;
  END IF;
  IF jsonb_array_length(COALESCE(v_u.righe,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Uscita senza righe'; END IF;

  v_numero_ddt := public.genera_numero_documento_native(v_company_id, 'ddt'::text, v_year);
  v_progressivo := COALESCE(NULLIF(split_part(v_numero_ddt, '-', array_length(string_to_array(v_numero_ddt, '-'), 1)), '')::integer, 1);

  -- Indirizzo di consegna: quello scritto ora, poi lo snapshot del
  -- destinatario (senza pezzi vuoti), poi il destinatario libero, poi — per un
  -- cantiere — l'indirizzo dei lavori della commessa.
  v_indirizzo := COALESCE(
    NULLIF(btrim(p_ddt_extra->>'indirizzo_consegna'), ''),
    NULLIF(btrim(concat_ws(', ',
      NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_via'), ''),
      NULLIF(btrim(concat_ws(' ',
        NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_cap'), ''),
        NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_comune'), ''))), ''),
      NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_provincia'), ''))), ''),
    NULLIF(btrim(v_u.destinatario_libero->>'indirizzo'), ''),
    CASE WHEN v_u.order_id IS NOT NULL THEN
      (SELECT NULLIF(btrim(COALESCE(NULLIF(btrim(o.indirizzo_lavori), ''), NULLIF(btrim(o.work_address), ''))), '')
         FROM public.orders o WHERE o.id = v_u.order_id AND o.company_id = v_company_id)
    END
  );

  -- Il destinatario del documento: lo snapshot dell'uscita; se manca, la
  -- commessa (cantiere) o i dati scritti a mano (libero).
  v_snapshot := v_u.cliente_snapshot;
  IF v_snapshot IS NULL OR v_snapshot = '{}'::jsonb THEN
    IF v_u.order_id IS NOT NULL THEN
      SELECT jsonb_strip_nulls(jsonb_build_object(
               'ragione_sociale', COALESCE(
                 NULLIF(btrim(concat_ws(' ', NULLIF(btrim(c.first_name), ''), NULLIF(btrim(c.last_name), ''))), ''),
                 'Commessa ' || o.order_code),
               'indirizzo_via', NULLIF(btrim(COALESCE(NULLIF(btrim(o.indirizzo_lavori), ''), o.work_address)), ''),
               'indirizzo_nazione', 'IT',
               'tipo_cliente', 'B2B'))
        INTO v_snapshot
        FROM public.orders o
        LEFT JOIN public.profiles c ON c.id = o.customer_id
       WHERE o.id = v_u.order_id AND o.company_id = v_company_id;
    ELSIF v_u.destinatario_libero IS NOT NULL THEN
      v_snapshot := jsonb_strip_nulls(jsonb_build_object(
        'ragione_sociale', v_u.destinatario_libero->>'ragione_sociale',
        'partita_iva', v_u.destinatario_libero->>'partita_iva',
        'indirizzo_via', v_u.destinatario_libero->>'indirizzo',
        'indirizzo_nazione', 'IT'));
    END IF;
  END IF;
  v_snapshot := COALESCE(v_snapshot, '{}'::jsonb);

  -- Materiale portato su un proprio cantiere non è una vendita.
  v_causale := COALESCE(
    NULLIF(btrim(p_ddt_extra->>'causale_trasporto'), ''),
    CASE WHEN v_u.destinatario_tipo = 'cantiere' THEN 'trasferimento_cantiere' ELSE 'vendita' END
  );

  INSERT INTO public.documenti_fiscali (
    company_id, tipo, numero, numero_progressivo, anno, data_emissione, stato,
    ordine_id, anagrafica_id, cliente_snapshot, righe, note_documento,
    ddt_causale_trasporto, ddt_aspetto_beni, ddt_numero_colli, ddt_peso,
    ddt_mezzo_trasporto, ddt_porto, ddt_vettore, ddt_indirizzo_consegna
  ) VALUES (
    v_company_id, 'ddt', v_numero_ddt, v_progressivo, v_year, CURRENT_DATE, 'bozza',
    v_u.order_id, v_u.customer_id, v_snapshot, v_u.righe,
    NULLIF(concat_ws(' · ', NULLIF(btrim(p_ddt_extra->>'note_documento'), ''), v_u.note), ''),
    v_causale,
    NULLIF(btrim(p_ddt_extra->>'aspetto_beni'), ''),
    NULLIF(NULLIF(btrim(p_ddt_extra->>'numero_colli'), '')::integer, 0),
    NULLIF(btrim(p_ddt_extra->>'peso'), ''),
    NULLIF(btrim(p_ddt_extra->>'mezzo_trasporto'), ''),
    COALESCE(NULLIF(btrim(p_ddt_extra->>'porto'), ''), 'Franco'),
    COALESCE(v_u.vettore, CASE WHEN NULLIF(btrim(p_ddt_extra->>'vettore'), '') IS NOT NULL THEN jsonb_build_object('descrizione', p_ddt_extra->>'vettore') END),
    CASE WHEN v_indirizzo IS NOT NULL THEN jsonb_build_object('indirizzo', v_indirizzo) END
  ) RETURNING id INTO v_documento_id;

  UPDATE public.warehouse_uscite SET documento_id = v_documento_id, stato = 'ddt_creato', updated_at = now() WHERE id = p_uscita_id;
  UPDATE public.warehouse_movements SET notes = 'Uscita ' || v_u.numero || ' · DDT ' || v_numero_ddt WHERE uscita_id = p_uscita_id;

  RETURN QUERY SELECT v_documento_id, v_numero_ddt;
END;
$function$
;
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


  PERFORM public.warehouse_access_v2(v_company_id,'can_edit_warehouse');
  PERFORM public.warehouse_location_access_v3(v_company_id,p_warehouse_id);
  IF p_quality_check_status IS NULL OR p_quality_check_status NOT IN ('ok','damaged','partial','pending') THEN
    RAISE EXCEPTION 'Controllo qualità non valido.' USING ERRCODE='22023'; END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND company_id=v_company_id) THEN
    RAISE EXCEPTION 'Fornitore non accessibile.' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.order_items i JOIN public.warehouse_stock s ON s.id=i.stock_item_id WHERE i.id=p_order_item_id AND s.tracking_mode='serialized') THEN
    RAISE EXCEPTION 'Per gli articoli con matricola usa la ricezione via scansione.' USING ERRCODE='22023'; END IF;

  -- Il su misura si spunta posizione per posizione: goods_receipts vuole un magazzino.
  IF public.riga_e_su_misura(p_order_item_id) THEN
    RAISE EXCEPTION 'Questa posizione è su misura: va al cantiere, non in magazzino. Registrala dall''arrivo merce, posizione per posizione.' USING errcode = 'P0001';
  END IF;

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
        SELECT v_ricevuto_bolle+coalesce(sum(quantity_received),0) INTO v_ricevuto_bolle FROM public.warehouse_oda_scan_receipts_v3 WHERE purchase_order_id=v_po_id AND order_item_id=p_order_item_id AND company_id=v_company_id;
        IF v_ricevuto_bolle <> v_ricevuto_oda THEN
          RAISE EXCEPTION 'Ricezioni e residuo dell’ordine non allineati: riconciliare prima di registrare altra merce';
        END IF;
        IF p_quantity_received > v_ordinato-v_ricevuto_bolle THEN
          RAISE EXCEPTION 'La quantità supera il residuo dell’ordine';
        END IF;
      END IF;
    END IF;
    PERFORM 1 FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
    IF p_ddt_ricezione_id IS NULL AND EXISTS(SELECT 1 FROM public.order_items WHERE id=p_order_item_id AND p_quantity_received > coalesce(quantity,0)-coalesce(quantity_received,0)) THEN
      RAISE EXCEPTION 'La quantità supera il residuo della posizione.' USING ERRCODE='PT409'; END IF;
  END;


  IF p_ddt_ricezione_id IS NULL THEN
    DECLARE v_po uuid; v_count integer; v_ordered numeric; v_already numeric; v_status text;
    BEGIN
      SELECT count(DISTINCT purchase_order_id),min(purchase_order_id::text)::uuid INTO v_count,v_po FROM public.purchase_order_items WHERE order_item_id=p_order_item_id AND company_id=v_company_id;
      IF v_count>1 THEN RAISE EXCEPTION 'Più ODA collegate: seleziona un DDT per identificare la ricezione.' USING ERRCODE='22023'; END IF;
      IF v_count=1 THEN
        SELECT status INTO v_status FROM public.purchase_orders WHERE id=v_po AND company_id=v_company_id FOR UPDATE;
        IF v_status NOT IN ('inviato','confermato','parziale') THEN RAISE EXCEPTION 'ODA non ricevibile nello stato attuale.' USING ERRCODE='PT409'; END IF;
        IF (SELECT count(*) FROM public.purchase_order_items WHERE purchase_order_id=v_po AND order_item_id=p_order_item_id AND company_id=v_company_id)<>1 THEN RAISE EXCEPTION 'Abbinamento ODA ambiguo.' USING ERRCODE='22023'; END IF;
        SELECT quantity,quantity_received INTO v_ordered,v_already FROM public.purchase_order_items WHERE purchase_order_id=v_po AND order_item_id=p_order_item_id AND company_id=v_company_id;
        IF p_quantity_received>v_ordered-v_already THEN RAISE EXCEPTION 'La quantità supera il residuo ODA.' USING ERRCODE='PT409'; END IF;
      END IF;
    END;
  END IF;

  INSERT INTO public.goods_receipts (
    order_item_id, warehouse_id, company_id, supplier_id, quantity_received, ddt_number,
    ddt_photo_url, quality_check_status, quality_notes, notes, received_by, ddt_ricezione_id
  ) VALUES (
    p_order_item_id, p_warehouse_id, v_company_id, p_supplier_id, p_quantity_received, p_ddt_number,
    p_ddt_photo_url, p_quality_check_status, p_quality_notes, p_notes, v_user_id, p_ddt_ricezione_id
  ) RETURNING id INTO v_receipt_id;

  UPDATE public.order_items
     SET quantity_received = COALESCE(quantity_received, 0) + p_quantity_received,
         warehouse_reserved_quantity = least(coalesce(quantity,0),public.warehouse_effective_reserve_v2(fulfillment_status,quantity,warehouse_reserved_quantity)+p_quantity_received),
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
;

-- Conserva il contratto RPC precedente, ma valida e registra l'intero lotto
-- in una transazione. Una matricola invalida non lascia carichi senza unità.
CREATE OR REPLACE FUNCTION public.receive_from_oda_via_scans(p_oda_id uuid,p_warehouse_id uuid,p_scans jsonb,p_ddt_number text DEFAULT NULL,p_ddt_ricezione_id uuid DEFAULT NULL)
RETURNS TABLE(shipped_items integer,created_units integer,oda_now_complete boolean,errors jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid; po public.purchase_orders; item public.purchase_order_items; s public.warehouse_stock;
 scan jsonb; qty numeric; sns jsonb; sn text; linked uuid; shipped integer:=0; units integer:=0; complete boolean;
BEGIN
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_oda_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ODA non accessibile.' USING ERRCODE='42501'; END IF;
 c:=po.company_id;
 PERFORM public.warehouse_access_v2(c,'can_edit_warehouse');
 PERFORM public.warehouse_location_access_v3(c,p_warehouse_id);
 IF po.status NOT IN ('inviato','confermato','parziale') THEN
   RAISE EXCEPTION 'Ricezione non consentita per ODA in stato %.',po.status USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_scans) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scans)=0 OR jsonb_array_length(p_scans)>500 THEN
   RAISE EXCEPTION 'Aggiungi almeno una riga valida (massimo 500).' USING ERRCODE='22023'; END IF;
 IF p_ddt_ricezione_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ddt_ricezione WHERE id=p_ddt_ricezione_id AND company_id=c AND (purchase_order_id IS NULL OR purchase_order_id=p_oda_id) AND (warehouse_id IS NULL OR warehouse_id=p_warehouse_id)) THEN
   RAISE EXCEPTION 'DDT di un’altra azienda, ODA o deposito.' USING ERRCODE='42501'; END IF;
 -- Ordine stabile dei lock, comune agli altri movimenti.
 PERFORM id FROM public.warehouse_stock WHERE id IN(SELECT (v->>'stock_item_id')::uuid FROM jsonb_array_elements(p_scans) v) ORDER BY id FOR UPDATE;
 FOR scan IN SELECT * FROM jsonb_array_elements(p_scans) LOOP
   SELECT * INTO s FROM public.warehouse_stock WHERE id=(scan->>'stock_item_id')::uuid AND company_id=c AND warehouse_id=p_warehouse_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Articolo non presente nel deposito selezionato.' USING ERRCODE='42501'; END IF;
   qty:=(scan->>'quantity')::numeric;
   IF qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<=0 THEN RAISE EXCEPTION 'Quantità non valida.' USING ERRCODE='22023'; END IF;
   IF (s.tracking_mode='serialized' OR public.unita_confrontabile(s.unita_misura)='pz') AND qty<>trunc(qty) THEN
     RAISE EXCEPTION 'Per questo articolo servono unità intere.' USING ERRCODE='22023'; END IF;
   linked:=nullif(scan->>'oda_item_id','')::uuid;
   item:=NULL;
   IF linked IS NOT NULL THEN
     SELECT * INTO item FROM public.purchase_order_items WHERE id=linked AND purchase_order_id=p_oda_id AND company_id=c FOR UPDATE;
     IF NOT FOUND OR item.stock_item_id IS DISTINCT FROM s.id THEN
       RAISE EXCEPTION 'Abbinamento tra riga ODA e articolo non valido.' USING ERRCODE='22023'; END IF;
     IF public.riga_e_su_misura(item.order_item_id) THEN RAISE EXCEPTION 'Il su misura si riceve per posizione in cantiere.' USING ERRCODE='22023'; END IF;
     IF qty>item.quantity-item.quantity_received THEN RAISE EXCEPTION 'La quantità supera il residuo della riga ODA.' USING ERRCODE='PT409'; END IF;
     IF public.unita_confrontabile(item.unit_of_measure) IS DISTINCT FROM public.unita_confrontabile(s.unita_misura) THEN
       RAISE EXCEPTION 'Unità della riga ODA e dell’articolo diverse.' USING ERRCODE='22023'; END IF;
     IF item.order_item_id IS NOT NULL THEN
       INSERT INTO public.warehouse_oda_scan_receipts_v3(company_id,purchase_order_id,purchase_order_item_id,order_item_id,quantity_received) VALUES(c,p_oda_id,item.id,item.order_item_id,qty);

     END IF;
     UPDATE public.purchase_order_items SET quantity_received=quantity_received+qty,received_date=current_date WHERE id=linked;
   ELSIF EXISTS(SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=p_oda_id AND stock_item_id=s.id) THEN
     -- Una riga presente nell'ODA non può essere fatta passare come extra.
     RAISE EXCEPTION 'Seleziona la riga ODA di questo articolo.' USING ERRCODE='22023';
   END IF;
   sns:=coalesce(nullif(scan->'serial_numbers','null'::jsonb),'[]'::jsonb);
   IF jsonb_typeof(sns) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Matricole non valide.' USING ERRCODE='22023'; END IF;
   IF s.tracking_mode='serialized' THEN
     IF jsonb_array_length(sns)<>qty OR (SELECT count(DISTINCT btrim(value)) FROM jsonb_array_elements_text(sns))<>qty OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(sns) WHERE nullif(btrim(value),'') IS NULL) THEN
       RAISE EXCEPTION 'Serve una matricola unica per ogni unità ricevuta.' USING ERRCODE='22023'; END IF;
     FOR sn IN SELECT btrim(value) FROM jsonb_array_elements_text(sns) LOOP
       INSERT INTO public.stock_units(company_id,stock_item_id,serial_number,status,warehouse_id,supplier_id,purchase_ddt_ricezione_id,purchase_date,created_by,purchase_price)
       VALUES(c,s.id,sn,'available',p_warehouse_id,po.supplier_id,p_ddt_ricezione_id,current_date,auth.uid(),CASE WHEN linked IS NOT NULL THEN item.unit_price*(1-item.discount_percent/100) ELSE s.unit_cost END);
       units:=units+1;
     END LOOP;
   ELSIF jsonb_array_length(sns)>0 THEN RAISE EXCEPTION 'Questo articolo non usa matricole.' USING ERRCODE='22023'; END IF;
   INSERT INTO public.warehouse_movements(stock_item_id,movement_type,quantity,notes,performed_by,company_id,warehouse_id,unit_cost)
   VALUES(s.id,'carico',qty,'Carico da ODA '||po.oda_number||coalesce(' · DDT '||nullif(btrim(p_ddt_number),''),''),auth.uid(),c,p_warehouse_id,CASE WHEN linked IS NOT NULL THEN item.unit_price*(1-item.discount_percent/100) ELSE s.unit_cost END);
   UPDATE public.warehouse_stock SET quantity=quantity+qty,supplier_id=coalesce(supplier_id,po.supplier_id),last_delivery_date=current_date,updated_at=now() WHERE id=s.id;
   IF linked IS NOT NULL AND item.order_item_id IS NOT NULL THEN
     UPDATE public.order_items SET warehouse_reserved_quantity=least(coalesce(quantity,0),public.warehouse_effective_reserve_v2(fulfillment_status,quantity,warehouse_reserved_quantity)+qty),quantity_received=coalesce(quantity_received,0)+qty,fulfillment_status='received',last_goods_receipt_date=now() WHERE id=item.order_item_id;
   END IF;
   INSERT INTO public.warehouse_scan_events(company_id,user_id,warehouse_id,scanned_code,scan_type,resolved_stock_item_id,resolution_status,supplier_id,purchase_order_id,quantity)
   VALUES(c,auth.uid(),p_warehouse_id,coalesce(scan->>'raw_code',''),'oda_receive',s.id,'matched',po.supplier_id,p_oda_id,qty);
   shipped:=shipped+1;
 END LOOP;
 SELECT NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=p_oda_id AND quantity_received<quantity) INTO complete;
 UPDATE public.purchase_orders SET status=CASE WHEN complete THEN 'ricevuto' ELSE 'parziale' END,actual_delivery_date=CASE WHEN complete THEN current_date ELSE actual_delivery_date END,updated_at=now() WHERE id=p_oda_id;
 RETURN QUERY SELECT shipped,units,complete,'[]'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.warehouse_receive_oda_v3(p_oda_id uuid,p_warehouse_id uuid,p_scans jsonb,p_ddt_number text,p_ddt_ricezione_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid; replay jsonb; result jsonb;
BEGIN
 SELECT company_id INTO c FROM public.purchase_orders WHERE id=p_oda_id;
 PERFORM public.warehouse_access_v2(c,'can_edit_warehouse');
 PERFORM public.warehouse_location_access_v3(c,p_warehouse_id);
 replay:=public.warehouse_claim_v2(c,p_request_id,'oda-receive',jsonb_build_object('oda',p_oda_id,'warehouse',p_warehouse_id,'scans',p_scans,'ddt_number',p_ddt_number,'ddt',p_ddt_ricezione_id));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(r) INTO result FROM public.receive_from_oda_via_scans(p_oda_id,p_warehouse_id,p_scans,p_ddt_number,p_ddt_ricezione_id) r;
 UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=c AND request_id=p_request_id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.warehouse_goods_receipt_v3(p_order_item_id uuid,p_warehouse_id uuid,p_quantity_received numeric,p_quality_check_status text,p_supplier_id uuid,p_ddt_number text,p_ddt_photo_url text,p_ddt_ricezione_id uuid,p_quality_notes text,p_notes text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid; replay jsonb; result jsonb; rid uuid;
BEGIN
 SELECT o.company_id INTO c FROM public.orders o JOIN public.order_items i ON i.order_id=o.id WHERE i.id=p_order_item_id;
 PERFORM public.warehouse_access_v2(c,'can_edit_warehouse');
 PERFORM public.warehouse_location_access_v3(c,p_warehouse_id);
 replay:=public.warehouse_claim_v2(c,p_request_id,'goods-receive',jsonb_build_object('item',p_order_item_id,'warehouse',p_warehouse_id,'qty',p_quantity_received,'quality',p_quality_check_status,'supplier',p_supplier_id,'ddt_number',p_ddt_number,'photo',p_ddt_photo_url,'ddt',p_ddt_ricezione_id,'quality_notes',p_quality_notes,'notes',p_notes));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 rid:=public.insert_goods_receipt_atomic(p_order_item_id,p_warehouse_id,p_quantity_received,p_quality_check_status,p_supplier_id,p_ddt_number,p_ddt_photo_url,p_ddt_ricezione_id,p_quality_notes,p_notes);
 result:=jsonb_build_object('receipt_id',rid);
 UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=c AND request_id=p_request_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.receive_from_oda_via_scans(uuid,uuid,jsonb,text,uuid),public.insert_goods_receipt_atomic(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text),public.create_ddt_from_uscita(uuid,jsonb),public.warehouse_receive_oda_v3(uuid,uuid,jsonb,text,uuid,uuid),public.warehouse_goods_receipt_v3(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_from_oda_via_scans(uuid,uuid,jsonb,text,uuid),public.insert_goods_receipt_atomic(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text),public.create_ddt_from_uscita(uuid,jsonb),public.warehouse_receive_oda_v3(uuid,uuid,jsonb,text,uuid,uuid),public.warehouse_goods_receipt_v3(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.warehouse_capabilities_v2(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.warehouse_access_v2(p_company_id,'can_view_warehouse');
 RETURN jsonb_build_object('version',3,'atomic_reservations',true,'idempotent_carichi',true,'idempotent_uscite',true,'fractional_returns',true,'serial_returns',true,'atomic_import',true,'atomic_transfers',true,'inventory_counts',true,'reorder',true,'idempotent_oda_receipts',true,'idempotent_goods_receipts',true);
END $$;

-- Sostituisce l'abbinamento arbitrario per nome con l'identità della posizione.
CREATE OR REPLACE FUNCTION public.auto_carico_stock_on_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.order_items; s public.warehouse_stock; src public.warehouse_stock; matches integer; root_id uuid; dest uuid;
BEGIN
 IF new.quality_check_status IS NULL OR new.quality_check_status NOT IN ('ok','partial') THEN RETURN new; END IF;
 IF new.warehouse_id IS NULL OR new.quantity_received IS NULL OR new.quantity_received<=0 THEN RETURN new; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-transfer-v3:'||new.company_id::text,0));
 SELECT * INTO i FROM public.order_items WHERE id=new.order_item_id FOR UPDATE;
 IF i.id IS NULL OR public.riga_e_su_misura(i.id) THEN RETURN new; END IF;
 IF i.stock_item_id IS NOT NULL THEN
   SELECT * INTO s FROM public.warehouse_stock WHERE id=i.stock_item_id AND company_id=new.company_id AND warehouse_id=new.warehouse_id FOR UPDATE;
   IF NOT FOUND THEN
     SELECT * INTO src FROM public.warehouse_stock WHERE id=i.stock_item_id AND company_id=new.company_id FOR UPDATE;
     IF src.id IS NULL THEN RAISE EXCEPTION 'Articolo di un’altra azienda.' USING ERRCODE='42501'; END IF;
     INSERT INTO public.warehouse_stock_identity_v3 VALUES(src.id,src.id,new.company_id) ON CONFLICT DO NOTHING;
     SELECT root_stock_id INTO root_id FROM public.warehouse_stock_identity_v3 WHERE stock_item_id=src.id AND company_id=new.company_id;
     INSERT INTO public.warehouse_transfer_links_v3 VALUES(new.company_id,root_id,src.warehouse_id,src.id) ON CONFLICT DO NOTHING;
     SELECT destination_stock_id INTO dest FROM public.warehouse_transfer_links_v3 WHERE company_id=new.company_id AND source_stock_id=root_id AND destination_warehouse_id=new.warehouse_id;
     IF dest IS NULL THEN
       INSERT INTO public.warehouse_stock(company_id,warehouse_id,name,description,quantity,unit_cost,vat_rate,supplier_id,min_stock_level,tracking_mode,requires_warranty,default_warranty_months,unita_misura,article_family_id,prezzo_da_definire)
       VALUES(new.company_id,new.warehouse_id,src.name,src.description,0,src.unit_cost,src.vat_rate,src.supplier_id,0,src.tracking_mode,src.requires_warranty,src.default_warranty_months,src.unita_misura,src.article_family_id,src.prezzo_da_definire) RETURNING id INTO dest;
       INSERT INTO public.warehouse_transfer_links_v3 VALUES(new.company_id,root_id,new.warehouse_id,dest);
       INSERT INTO public.warehouse_stock_identity_v3 VALUES(dest,root_id,new.company_id);
     END IF;
     SELECT * INTO s FROM public.warehouse_stock WHERE id=dest AND company_id=new.company_id AND warehouse_id=new.warehouse_id FOR UPDATE;
     IF s.id IS NULL OR s.tracking_mode<>src.tracking_mode OR public.unita_confrontabile(s.unita_misura) IS DISTINCT FROM public.unita_confrontabile(src.unita_misura) THEN RAISE EXCEPTION 'Scheda di destinazione non coerente.' USING ERRCODE='PT409'; END IF;
   END IF;
 ELSE
   -- Il nome da solo non basta: anche unità e tracciamento devono coincidere.
   SELECT count(*) INTO matches FROM public.warehouse_stock WHERE company_id=new.company_id AND warehouse_id=new.warehouse_id AND name=i.name AND public.unita_confrontabile(unita_misura)=public.unita_confrontabile(i.unita_misura) AND tracking_mode='fungible';
   IF matches>1 THEN RAISE EXCEPTION 'Più articoli compatibili: collega esplicitamente l’articolo alla posizione.' USING ERRCODE='22023'; END IF;
   IF matches=1 THEN SELECT * INTO s FROM public.warehouse_stock WHERE company_id=new.company_id AND warehouse_id=new.warehouse_id AND name=i.name AND public.unita_confrontabile(unita_misura)=public.unita_confrontabile(i.unita_misura) AND tracking_mode='fungible' FOR UPDATE;
   ELSE
     INSERT INTO public.warehouse_stock(company_id,warehouse_id,name,quantity,unit_cost,supplier_id,unita_misura)
     VALUES(new.company_id,new.warehouse_id,i.name,0,coalesce(i.purchase_price,0),coalesce(new.supplier_id,i.supplier_id),i.unita_misura) RETURNING * INTO s;
   END IF;

 END IF;
 IF s.tracking_mode='serialized' THEN RAISE EXCEPTION 'Ricevi questo articolo tramite scansione delle matricole.' USING ERRCODE='22023'; END IF;
 -- Il trigger del costo medio deve vedere la giacenza prima del nuovo carico.
 INSERT INTO public.warehouse_movements(stock_item_id,order_item_id,movement_type,quantity,unit_cost,performed_by,warehouse_id,notes,company_id)
 VALUES(s.id,i.id,'carico',new.quantity_received,coalesce(i.purchase_price,0),new.received_by,new.warehouse_id,'Auto-carico da goods_receipt '||new.id::text,new.company_id);
 UPDATE public.warehouse_stock SET quantity=quantity+new.quantity_received,updated_at=now() WHERE id=s.id;
 IF i.stock_item_id IS DISTINCT FROM s.id THEN UPDATE public.order_items SET stock_item_id=s.id WHERE id=i.id; END IF;
 RETURN new;
END $$;
-- Non si installa un secondo trigger nel servizio reale: sostituisce la funzione esistente.
-- La fixture installa questo trigger solo se assente.

CREATE OR REPLACE FUNCTION public.ricalcola_ricezione_oda(p_po_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE po public.purchase_orders; total integer; covered integer; received integer; last_day date;
BEGIN
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_po_id FOR UPDATE;
 IF po.id IS NULL OR po.status IN ('bozza','annullato') THEN RETURN; END IF;
 WITH receipts AS (
   SELECT g.order_item_id,g.quantity_received,g.receipt_date FROM public.goods_receipts g LEFT JOIN public.ddt_ricezione d ON d.id=g.ddt_ricezione_id AND d.company_id=g.company_id
   WHERE g.company_id=po.company_id AND (g.ddt_ricezione_id IS NULL OR d.purchase_order_id=p_po_id)
   UNION ALL
   SELECT order_item_id,quantity_received,receipt_date FROM public.warehouse_oda_scan_receipts_v3 WHERE purchase_order_id=p_po_id AND company_id=po.company_id
 ), amounts AS (SELECT order_item_id,sum(quantity_received) qty,max(receipt_date) AS last_receipt FROM receipts GROUP BY order_item_id)
 UPDATE public.purchase_order_items i SET quantity_received=coalesce(a.qty,0),received_date=a.last_receipt
 FROM (SELECT i2.id,a2.qty,a2.last_receipt FROM public.purchase_order_items i2 LEFT JOIN amounts a2 ON a2.order_item_id=i2.order_item_id WHERE i2.purchase_order_id=p_po_id AND i2.order_item_id IS NOT NULL AND NOT public.riga_e_su_misura(i2.order_item_id)) a WHERE i.id=a.id;
 SELECT count(*),count(*) FILTER(WHERE quantity_received>=quantity),count(*) FILTER(WHERE quantity_received>0),max(received_date) INTO total,covered,received,last_day FROM public.purchase_order_items WHERE purchase_order_id=p_po_id AND quantity>0;
 IF covered=total AND total>0 THEN UPDATE public.purchase_orders SET status='ricevuto',actual_delivery_date=coalesce(actual_delivery_date,last_day,current_date) WHERE id=p_po_id;
 ELSIF received>0 THEN UPDATE public.purchase_orders SET status='parziale' WHERE id=p_po_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.auto_carico_stock_on_receipt(),public.ricalcola_ricezione_oda(uuid) FROM PUBLIC,anon,authenticated;

-- magazzino-p6-riconciliazione.sql
-- SOLO LOCALE. Richiede P2-P5. Non mettere in supabase/migrations.
SET lock_timeout='3s';
SET statement_timeout='60s';
CREATE TABLE IF NOT EXISTS public.warehouse_receipt_opening_balances_v4(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id),
 quantity numeric NOT NULL CHECK(quantity>0 AND quantity::text NOT IN ('NaN','Infinity','-Infinity')),
 recorded_quantity numeric NOT NULL, documented_quantity numeric NOT NULL,
 source_kind text NOT NULL DEFAULT 'legacy_recorded' CHECK(source_kind='legacy_recorded'),
 source_snapshot jsonb NOT NULL, source_hash text NOT NULL, reconciliation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,purchase_order_item_id,reconciliation_id)
);
-- Ogni nuova riconciliazione aggiunge un saldo: non riscrive la provenienza precedente.
DO $$DECLARE c record;BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.warehouse_receipt_opening_balances_v4'::regclass AND contype='u' AND array_length(conkey,1)=2 LOOP
  EXECUTE format('ALTER TABLE public.warehouse_receipt_opening_balances_v4 DROP CONSTRAINT %I',c.conname);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.warehouse_receipt_opening_balances_v4'::regclass AND contype='u') THEN
  ALTER TABLE public.warehouse_receipt_opening_balances_v4 ADD CONSTRAINT warehouse_receipt_opening_balance_request_v4 UNIQUE(company_id,purchase_order_item_id,reconciliation_id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.warehouse_receipt_reconciliations_v4(
 id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id),
 source_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_receipt_opening_balances_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_receipt_reconciliations_v4 ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS warehouse_receipt_reconciliations_company_v4 ON public.warehouse_receipt_reconciliations_v4(company_id,(result->>'purchase_order_id'));
REVOKE ALL ON public.warehouse_receipt_opening_balances_v4,public.warehouse_receipt_reconciliations_v4 FROM PUBLIC,anon,authenticated;

-- Conteggio per posizione: una bolla esplicita non va attribuita a un altro ODA.
-- Le ricezioni prive di bolla sono ammesse solo con un abbinamento univoco.
CREATE OR REPLACE FUNCTION public.warehouse_receipt_totals_v4(p_po_id uuid)
RETURNS TABLE(item_id uuid,documented numeric,scanned numeric,opening numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT i.id,
 coalesce((SELECT sum(g.quantity_received) FROM public.goods_receipts g LEFT JOIN public.ddt_ricezione d ON d.id=g.ddt_ricezione_id AND d.company_id=g.company_id
  WHERE g.company_id=i.company_id AND g.order_item_id=i.order_item_id AND
   ((g.ddt_ricezione_id IS NOT NULL AND d.purchase_order_id=i.purchase_order_id)
    OR (g.ddt_ricezione_id IS NULL AND (SELECT count(*) FROM public.purchase_order_items z WHERE z.company_id=i.company_id AND z.order_item_id=i.order_item_id)=1))),0),
 coalesce((SELECT sum(s.quantity_received) FROM public.warehouse_oda_scan_receipts_v3 s WHERE s.company_id=i.company_id AND s.purchase_order_id=i.purchase_order_id AND s.purchase_order_item_id=i.id),0),
 coalesce((SELECT sum(b.quantity) FROM public.warehouse_receipt_opening_balances_v4 b WHERE b.company_id=i.company_id AND b.purchase_order_item_id=i.id),0)
 FROM public.purchase_order_items i WHERE i.purchase_order_id=p_po_id AND i.order_item_id IS NOT NULL AND NOT public.riga_e_su_misura(i.order_item_id)
$$;

CREATE OR REPLACE FUNCTION public.warehouse_receipt_reconciliation_preview_v4(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rows jsonb; blocked jsonb; fingerprint text;
BEGIN
 IF p_company_id IS NULL THEN RAISE EXCEPTION 'Seleziona l’azienda.' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'order_id',i.purchase_order_id,'order_item_id',i.order_item_id,
   'ordered',i.quantity,'recorded',i.quantity_received,'documented',t.documented,'scanned',t.scanned,'opening',t.opening,
   'status',p.status,'received_date',i.received_date,'updated_at',i.updated_at,
   'action',CASE WHEN i.quantity_received>t.documented+t.scanned+t.opening THEN 'preserve_legacy_balance' ELSE 'align_documented_counter' END,
   'quantity',abs(i.quantity_received-(t.documented+t.scanned+t.opening))) ORDER BY i.id),'[]'::jsonb) INTO rows
 FROM public.purchase_orders p JOIN public.purchase_order_items i ON i.purchase_order_id=p.id
 CROSS JOIN LATERAL public.warehouse_receipt_totals_v4(p.id) t
 WHERE p.company_id=p_company_id AND i.company_id=p_company_id AND t.item_id=i.id
 AND i.quantity_received<>t.documented+t.scanned+t.opening;
 SELECT coalesce(jsonb_agg(b),'[]'::jsonb) INTO blocked FROM (
  SELECT jsonb_build_object('reason','ricezione_non_univoca','receipt_id',g.id) b
  FROM public.goods_receipts g LEFT JOIN public.ddt_ricezione d ON d.id=g.ddt_ricezione_id AND d.company_id=g.company_id
  WHERE g.company_id=p_company_id AND (SELECT count(*) FROM public.purchase_order_items i WHERE i.company_id=p_company_id AND i.order_item_id=g.order_item_id AND (g.ddt_ricezione_id IS NULL OR i.purchase_order_id=d.purchase_order_id))<>1
  UNION ALL
  SELECT jsonb_build_object('reason','quantita_oltre_ordinato','item_id',r->>'item_id') FROM jsonb_array_elements(rows) r
  WHERE greatest((r->>'recorded')::numeric,(r->>'documented')::numeric+(r->>'scanned')::numeric+(r->>'opening')::numeric)>(r->>'ordered')::numeric
 ) q;
 -- Il fingerprint include i fatti che possono cambiare l'attribuzione anche
 -- quando la somma è identica (id bolla/ricezione/ODA, qualità e quantità).
 fingerprint:=md5(jsonb_build_object('rows',rows,'blocked',blocked,
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_array(i.id,i.purchase_order_id,i.order_item_id,i.quantity,i.quantity_received,i.received_date,i.updated_at) ORDER BY i.id),'[]') FROM public.purchase_order_items i WHERE i.company_id=p_company_id),
  'receipts',(SELECT coalesce(jsonb_agg(jsonb_build_array(g.id,g.order_item_id,g.ddt_ricezione_id,g.quantity_received,g.quality_check_status,g.receipt_date) ORDER BY g.id),'[]') FROM public.goods_receipts g WHERE g.company_id=p_company_id),
  'ddt',(SELECT coalesce(jsonb_agg(jsonb_build_array(d.id,d.purchase_order_id,d.company_id) ORDER BY d.id),'[]') FROM public.ddt_ricezione d WHERE d.company_id=p_company_id))::text);
 RETURN jsonb_build_object('company_id',p_company_id,'source_hash',fingerprint,'rows',rows,'blocked',blocked,
   'legacy_balances',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'action'='preserve_legacy_balance'),
   'counter_alignments',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'action'='align_documented_counter'),
   'su_misura_rows',(SELECT count(*) FROM public.purchase_order_items i WHERE i.company_id=p_company_id AND public.riga_e_su_misura(i.order_item_id)));
END $$;

CREATE OR REPLACE FUNCTION public.warehouse_receipt_reconciliation_apply_v4(p_company_id uuid,p_expected_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE preview jsonb; previous public.warehouse_receipt_reconciliations_v4; r jsonb; result jsonb;
BEGIN
 IF p_request_id IS NULL OR p_expected_hash IS NULL THEN RAISE EXCEPTION 'Manca la conferma del piano.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-reconciliation-v4:'||p_company_id::text,0));
 SELECT * INTO previous FROM public.warehouse_receipt_reconciliations_v4 WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF previous.company_id IS DISTINCT FROM p_company_id OR previous.source_hash IS DISTINCT FROM p_expected_hash THEN RAISE EXCEPTION 'Richiesta già usata per un piano diverso.' USING ERRCODE='PT409'; END IF;
  RETURN previous.result;
 END IF;
 PERFORM id FROM public.purchase_orders WHERE company_id=p_company_id ORDER BY id FOR UPDATE;
 PERFORM id FROM public.purchase_order_items WHERE company_id=p_company_id ORDER BY id FOR UPDATE;
 preview:=public.warehouse_receipt_reconciliation_preview_v4(p_company_id);
 IF preview->>'source_hash' IS DISTINCT FROM p_expected_hash THEN RAISE EXCEPTION 'I dati sono cambiati: genera una nuova anteprima.' USING ERRCODE='PT409'; END IF;
 IF jsonb_array_length(preview->'blocked')>0 THEN RAISE EXCEPTION 'Abbinamenti non verificabili: nessuna modifica applicata.' USING ERRCODE='PT409'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(preview->'rows') LOOP
  IF r->>'action'='preserve_legacy_balance' THEN
   INSERT INTO public.warehouse_receipt_opening_balances_v4(company_id,purchase_order_item_id,quantity,recorded_quantity,documented_quantity,source_snapshot,source_hash,reconciliation_id)
   VALUES(p_company_id,(r->>'item_id')::uuid,(r->>'quantity')::numeric,(r->>'recorded')::numeric,(r->>'documented')::numeric,r,p_expected_hash,p_request_id);
  ELSE
   -- Solo il contatore della posizione: merce già ricevuta, nessun carico,
   -- nessuna promozione di stato, nessun nuovo costo o pagamento.
   UPDATE public.purchase_order_items SET quantity_received=(r->>'documented')::numeric+(r->>'scanned')::numeric+(r->>'opening')::numeric WHERE id=(r->>'item_id')::uuid AND company_id=p_company_id;
  END IF;
 END LOOP;
 result:=jsonb_build_object('request_id',p_request_id,'company_id',p_company_id,'source_hash',p_expected_hash,'legacy_balances',preview->'legacy_balances','counter_alignments',preview->'counter_alignments');
 INSERT INTO public.warehouse_receipt_reconciliations_v4(id,company_id,source_hash,result) VALUES(p_request_id,p_company_id,p_expected_hash,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.warehouse_receipt_assert_v4(p_po_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.purchase_order_items i CROSS JOIN LATERAL public.warehouse_receipt_totals_v4(p_po_id) t WHERE i.id=t.item_id AND i.quantity_received<>t.documented+t.scanned+t.opening) THEN
  RAISE EXCEPTION 'Ricezioni pregresse da riconciliare prima di registrare nuova merce.' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouse_receipt_reconciliations_v4 r JOIN public.purchase_orders p ON p.company_id=r.company_id WHERE p.id=p_po_id AND (NOT(r.result ? 'purchase_order_id') OR r.result->>'purchase_order_id'=p_po_id::text)) THEN
  INSERT INTO public.warehouse_receipt_reconciliations_v4(id,company_id,source_hash,result) SELECT gen_random_uuid(),p.company_id,'runtime-verified',jsonb_build_object('purchase_order_id',p_po_id,'kind','runtime_verified') FROM public.purchase_orders p WHERE p.id=p_po_id;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ricalcola_ricezione_oda(p_po_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE po public.purchase_orders; total integer; covered integer; received integer; last_day date;
BEGIN
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_po_id FOR UPDATE;
 IF po.id IS NULL OR po.status IN ('bozza','annullato') THEN RETURN; END IF;
 -- Un saldo storico non viene mai azzerato da un nuovo ricalcolo.
 IF NOT EXISTS(SELECT 1 FROM public.warehouse_receipt_reconciliations_v4 r WHERE r.company_id=po.company_id AND (NOT(r.result ? 'purchase_order_id') OR r.result->>'purchase_order_id'=p_po_id::text)) AND EXISTS(SELECT 1 FROM public.purchase_order_items i CROSS JOIN LATERAL public.warehouse_receipt_totals_v4(p_po_id) t WHERE i.id=t.item_id AND i.quantity_received>t.documented+t.scanned+t.opening) THEN
  RAISE EXCEPTION 'Saldo storico non riconciliato: nessuna ricezione modificata.' USING ERRCODE='PT409'; END IF;
 UPDATE public.purchase_order_items i SET quantity_received=t.documented+t.scanned+t.opening,
  received_date=CASE WHEN t.documented+t.scanned+t.opening>0 THEN coalesce(i.received_date,current_date) ELSE NULL END
 FROM public.warehouse_receipt_totals_v4(p_po_id) t WHERE i.id=t.item_id;
 SELECT count(*),count(*) FILTER(WHERE quantity_received>=quantity),count(*) FILTER(WHERE quantity_received>0),max(received_date) INTO total,covered,received,last_day FROM public.purchase_order_items WHERE purchase_order_id=p_po_id AND quantity>0;
 IF covered=total AND total>0 THEN UPDATE public.purchase_orders SET status='ricevuto',actual_delivery_date=coalesce(actual_delivery_date,last_day,current_date) WHERE id=p_po_id AND status<>'ricevuto';
 ELSIF received>0 THEN UPDATE public.purchase_orders SET status='parziale' WHERE id=p_po_id AND status<>'parziale';
 ELSIF po.status IN ('parziale','ricevuto') THEN UPDATE public.purchase_orders SET status='confermato',actual_delivery_date=NULL WHERE id=p_po_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouse_receipt_reconciliations_v4 r WHERE r.company_id=po.company_id AND (NOT(r.result ? 'purchase_order_id') OR r.result->>'purchase_order_id'=p_po_id::text)) THEN
  INSERT INTO public.warehouse_receipt_reconciliations_v4(id,company_id,source_hash,result) VALUES(gen_random_uuid(),po.company_id,'runtime-verified',jsonb_build_object('purchase_order_id',p_po_id,'kind','runtime_verified'));
 END IF;
END $$;

-- Aggiunge la guardia PRIMA della scrittura alle firme P5 già collaudate.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.receive_from_oda_via_scans(uuid,uuid,jsonb,text,uuid)'::regprocedure) INTO definition;
 IF position('warehouse_receipt_assert_v4' IN definition)=0 THEN
  IF position('c:=po.company_id;' IN definition)=0 THEN RAISE EXCEPTION 'Versione ricezione ODA diversa da P5: revisione richiesta'; END IF;
  definition:=replace(definition,'PERFORM public.warehouse_location_access_v3(c,p_warehouse_id);','PERFORM public.warehouse_location_access_v3(c,p_warehouse_id); PERFORM public.warehouse_receipt_assert_v4(p_oda_id);');EXECUTE definition;
 END IF;
 SELECT pg_get_functiondef('public.insert_goods_receipt_atomic(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text)'::regprocedure) INTO definition;
 IF position('warehouse_receipt_assert_v4' IN definition)=0 THEN
  IF position('  INSERT INTO public.goods_receipts (' IN definition)=0 THEN RAISE EXCEPTION 'Versione ricezione merce diversa da P5: revisione richiesta'; END IF;
  definition:=replace(definition,'  INSERT INTO public.goods_receipts (',E'  PERFORM public.warehouse_receipt_assert_v4(i.purchase_order_id) FROM public.purchase_order_items i WHERE i.order_item_id=p_order_item_id AND i.company_id=v_company_id;\n  INSERT INTO public.goods_receipts (');EXECUTE definition;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_receipt_totals_v4(uuid),public.warehouse_receipt_reconciliation_preview_v4(uuid),public.warehouse_receipt_reconciliation_apply_v4(uuid,text,uuid),public.warehouse_receipt_assert_v4(uuid),public.ricalcola_ricezione_oda(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_receipt_reconciliation_preview_v4(uuid),public.warehouse_receipt_reconciliation_apply_v4(uuid,text,uuid) TO service_role;

-- La verifica del residuo documentale deve comprendere anche il saldo storico.
DO $$DECLARE definition text;marker text;BEGIN
 SELECT pg_get_functiondef('public.insert_goods_receipt_atomic(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text)'::regprocedure) INTO definition;
 marker:='        IF v_ricevuto_bolle <> v_ricevuto_oda THEN';
 IF position('warehouse_receipt_opening_balances_v4 b' IN definition)=0 THEN
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Guardia residuo differente: revisione richiesta'; END IF;
  definition:=replace(definition,marker,E'        SELECT v_ricevuto_bolle+coalesce(sum(b.quantity),0) INTO v_ricevuto_bolle FROM public.warehouse_receipt_opening_balances_v4 b JOIN public.purchase_order_items i ON i.id=b.purchase_order_item_id WHERE b.company_id=v_company_id AND i.purchase_order_id=v_po_id AND i.order_item_id=p_order_item_id;\n'||marker);
  EXECUTE definition;
 END IF;
END $$;

-- magazzino-p7-permessi-storno.sql
-- SOLO LOCALE. Richiede P2-P6. Nessuna applicazione online autorizzata.
SET lock_timeout='3s';SET statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.warehouse_can_write_v4(p_company uuid,p_warehouse uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND coalesce(public.has_permission_for_company(auth.uid(),'can_edit_warehouse',p_company),false)
 AND coalesce(public.warehouse_location_allowed_v3(p_company,p_warehouse),false)
$$;
REVOKE ALL ON FUNCTION public.warehouse_can_write_v4(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_can_write_v4(uuid,uuid) TO authenticated;

-- Le policy permissive esistenti restano per la lettura. Queste condizioni
-- restrittive impediscono che un vecchio ALL conceda scritture al solo lettore.
DO $$DECLARE t text;command text;expression text; BEGIN
 FOREACH t IN ARRAY ARRAY['warehouse_stock','warehouse_movements','goods_receipts','warehouse_uscite','stock_units'] LOOP
  expression:='public.warehouse_can_write_v4(company_id,warehouse_id)';
  FOREACH command IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','warehouse_write_'||lower(command)||'_v4',t);
   EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s %s',
    'warehouse_write_'||lower(command)||'_v4',t,command,
    CASE WHEN command IN ('UPDATE','DELETE') THEN 'USING ('||expression||')' ELSE '' END,
    CASE WHEN command IN ('INSERT','UPDATE') THEN 'WITH CHECK ('||expression||')' ELSE '' END);
  END LOOP;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.warehouse_receipt_direct_guard_v4()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user<>'authenticated' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.received_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Utente della ricezione non valido.' USING ERRCODE='42501'; END IF;
 ELSE
  IF ROW(NEW.order_item_id,NEW.warehouse_id,NEW.company_id,NEW.quantity_received,NEW.received_by,NEW.quality_check_status,NEW.ddt_ricezione_id)
    IS DISTINCT FROM ROW(OLD.order_item_id,OLD.warehouse_id,OLD.company_id,OLD.quantity_received,OLD.received_by,OLD.quality_check_status,OLD.ddt_ricezione_id) THEN
   RAISE EXCEPTION 'Per rettificare questa ricezione annulla il carico e registralo di nuovo: quantità e giacenza devono restare allineate.' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE i.id=NEW.order_item_id AND o.company_id=NEW.company_id)
 OR (NEW.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=NEW.supplier_id AND company_id=NEW.company_id))
 OR (NEW.ddt_ricezione_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ddt_ricezione WHERE id=NEW.ddt_ricezione_id AND company_id=NEW.company_id)) THEN
  RAISE EXCEPTION 'Collegamenti della ricezione non appartenenti all’azienda.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_receipt_direct_guard_v4 ON public.goods_receipts;
CREATE TRIGGER a_receipt_direct_guard_v4 BEFORE INSERT OR UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.warehouse_receipt_direct_guard_v4();

-- Lo storno usa il riferimento esatto del carico. Il nome non identifica
-- un articolo e non può autorizzare uno scarico su una scheda omonima.
CREATE OR REPLACE FUNCTION public.auto_storno_stock_on_receipt_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE movement public.warehouse_movements; item public.order_items; stock public.warehouse_stock; count_matches integer; own_reserve numeric; release numeric;
BEGIN
 IF coalesce(OLD.quantity_received,0)<=0 THEN RETURN OLD; END IF;
 SELECT * INTO item FROM public.order_items WHERE id=OLD.order_item_id FOR UPDATE;
 IF OLD.quality_check_status IS NULL OR OLD.quality_check_status NOT IN ('ok','partial') OR OLD.warehouse_id IS NULL THEN
  UPDATE public.order_items SET quantity_received=greatest(coalesce(quantity_received,0)-OLD.quantity_received,0),receipt_id=CASE WHEN receipt_id=OLD.id THEN NULL ELSE receipt_id END,
   fulfillment_status=CASE WHEN coalesce(quantity_received,0)-OLD.quantity_received<=0 THEN 'not_started' ELSE fulfillment_status END WHERE id=item.id;
  RETURN OLD;
 END IF;
 SELECT count(*) INTO count_matches FROM public.warehouse_movements
 WHERE company_id=OLD.company_id AND warehouse_id=OLD.warehouse_id AND order_item_id=OLD.order_item_id AND movement_type='carico' AND notes='Auto-carico da goods_receipt '||OLD.id::text;
 IF count_matches<>1 THEN RAISE EXCEPTION 'Carico originale non identificabile univocamente: verifica i movimenti prima di annullare la ricezione.' USING ERRCODE='PT409'; END IF;
 SELECT * INTO movement FROM public.warehouse_movements WHERE company_id=OLD.company_id AND warehouse_id=OLD.warehouse_id AND order_item_id=OLD.order_item_id AND movement_type='carico' AND notes='Auto-carico da goods_receipt '||OLD.id::text;
 IF movement.quantity<>OLD.quantity_received THEN RAISE EXCEPTION 'Quantità del carico originale non coerente: nessuno storno applicato.' USING ERRCODE='PT409'; END IF;
 SELECT * INTO item FROM public.order_items WHERE id=OLD.order_item_id FOR UPDATE;
 SELECT * INTO stock FROM public.warehouse_stock WHERE id=movement.stock_item_id AND company_id=OLD.company_id AND warehouse_id=OLD.warehouse_id FOR UPDATE;
 IF stock.id IS NULL OR stock.tracking_mode='serialized' THEN RAISE EXCEPTION 'Origine o matricole da verificare prima dello storno.' USING ERRCODE='PT409'; END IF;
 own_reserve:=CASE WHEN item.stock_item_id=stock.id THEN public.warehouse_effective_reserve_v2(item.fulfillment_status,item.quantity,item.warehouse_reserved_quantity) ELSE 0 END;
 release:=least(own_reserve,OLD.quantity_received);
 IF stock.quantity-OLD.quantity_received<stock.quantity_reserved-release THEN RAISE EXCEPTION 'Materiale già prelevato o prenotato da altre posizioni: annullamento non disponibile.' USING ERRCODE='PT409'; END IF;
 UPDATE public.order_items SET warehouse_reserved_quantity=CASE WHEN item.stock_item_id=stock.id THEN greatest(own_reserve-release,0) ELSE warehouse_reserved_quantity END,quantity_received=greatest(coalesce(quantity_received,0)-OLD.quantity_received,0),
  receipt_id=CASE WHEN receipt_id=OLD.id THEN NULL ELSE receipt_id END,
  fulfillment_status=CASE WHEN coalesce(quantity_received,0)-OLD.quantity_received<=0 AND item.stock_item_id=stock.id THEN 'not_started' ELSE fulfillment_status END
 WHERE id=item.id;
 UPDATE public.warehouse_stock SET quantity=quantity-OLD.quantity_received,updated_at=now() WHERE id=stock.id;
 INSERT INTO public.warehouse_movements(stock_item_id,order_item_id,movement_type,quantity,unit_cost,performed_by,warehouse_id,notes,company_id,valorizza_medio)
 VALUES(stock.id,OLD.order_item_id,'scarico',OLD.quantity_received,movement.unit_cost,coalesce(auth.uid(),OLD.received_by),OLD.warehouse_id,'Storno automatico: cancellata la ricezione '||OLD.id::text,OLD.company_id,false);
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.auto_storno_stock_on_receipt_delete(),public.warehouse_receipt_direct_guard_v4() FROM PUBLIC,anon,authenticated;

-- In attesa di controllo o danneggiata: ricevuta documentale senza disponibilità
-- fisica e senza prenotare merce che il trigger non ha caricato.
DO $$DECLARE definition text;source text;replacement text;BEGIN
 SELECT pg_get_functiondef('public.insert_goods_receipt_atomic(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text)'::regprocedure) INTO definition;
 source:='warehouse_reserved_quantity = least(coalesce(quantity,0),public.warehouse_effective_reserve_v2(fulfillment_status,quantity,warehouse_reserved_quantity)+p_quantity_received),';
 replacement:='warehouse_reserved_quantity = CASE WHEN p_quality_check_status IN (''ok'',''partial'') THEN least(coalesce(quantity,0),public.warehouse_effective_reserve_v2(fulfillment_status,quantity,warehouse_reserved_quantity)+p_quantity_received) ELSE public.warehouse_effective_reserve_v2(fulfillment_status,quantity,warehouse_reserved_quantity) END,';
 IF position(source IN definition)>0 THEN EXECUTE replace(definition,source,replacement);
 ELSIF position(replacement IN definition)=0 THEN RAISE EXCEPTION 'Versione ricezione differente: verificare la prenotazione della merce da controllare'; END IF;
END $$;

-- magazzino-p8-prenotazioni.sql
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

-- magazzino-p9-carico-costi.sql
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

-- magazzino-p10-ricezioni-frazionarie.sql
-- SOLO LOCALE. Richiede P2-P9. Nessuna migrazione online autorizzata.
-- Conversione esatta integer -> numeric; al rilascio richiede preflight e lock breve.
SET lock_timeout='3s'; SET statement_timeout='60s';
-- PostgreSQL impedisce il cambio tipo quando un WHEN di trigger usa la colonna.
-- Definizioni e stati dei trigger sono conservati e ripristinati nella stessa
-- transazione con lock di tabella: nessuna scrittura può vedere uno stato parziale.
DO $type$ DECLARE triggers jsonb; t jsonb; BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled)),'[]')
 INTO triggers FROM pg_trigger WHERE tgrelid='public.goods_receipts'::regclass AND NOT tgisinternal;
 FOR t IN SELECT * FROM jsonb_array_elements(triggers) LOOP EXECUTE format('DROP TRIGGER %I ON public.goods_receipts',t->>'name');END LOOP;
 ALTER TABLE public.goods_receipts ALTER COLUMN quantity_received TYPE numeric USING quantity_received::numeric;
 FOR t IN SELECT * FROM jsonb_array_elements(triggers) LOOP
  EXECUTE t->>'definition';
  EXECUTE format('ALTER TABLE public.goods_receipts %s TRIGGER %I',CASE t->>'enabled' WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,t->>'name');
 END LOOP;
END $type$;
DO $patch$
DECLARE definition text;
 old_guard text := $old$IF p_quantity_received <> trunc(p_quantity_received) THEN
      RAISE EXCEPTION 'Questa ricezione non supporta quantità frazionarie: nessun movimento registrato';
    END IF;$old$;
 new_guard text := $new$-- WAREHOUSE_FRACTIONAL_RECEIPT_V5: quantità misurabili, pezzi interi.
    IF p_quantity_received <> trunc(p_quantity_received) AND EXISTS (
      SELECT 1 FROM public.order_items i LEFT JOIN public.warehouse_stock s ON s.id=i.stock_item_id
      WHERE i.id=p_order_item_id AND public.unita_confrontabile(coalesce(i.unita_misura,s.unita_misura))='pz'
    ) THEN RAISE EXCEPTION 'Per questo materiale servono unità intere.' USING ERRCODE='22023'; END IF;$new$;
BEGIN
 SELECT pg_get_functiondef('public.insert_goods_receipt_atomic(uuid,uuid,numeric,text,uuid,text,text,uuid,text,text)'::regprocedure) INTO definition;
 IF position('WAREHOUSE_FRACTIONAL_RECEIPT_V5' IN definition)=0 THEN
  IF position(old_guard IN definition)=0 THEN RAISE EXCEPTION 'Versione ricezione diversa da quella collaudata: revisione richiesta'; END IF;
  EXECUTE replace(definition,old_guard,new_guard);
 END IF;
END $patch$;
-- Nessun nuovo endpoint e nessuna estensione dei privilegi esistenti.


-- Il preflight sul database di destinazione ha individuato un solo archivio
-- dimostrativo con saldi da ricondurre a ricezioni pregresse.
DO $riconciliazione$
DECLARE
  azienda uuid;
  piano jsonb;
  operazione uuid := '20290420-1250-4000-a000-000000000001';
BEGIN
  FOR azienda IN SELECT DISTINCT company_id FROM public.purchase_order_items WHERE order_item_id IS NOT NULL LOOP
    piano := public.warehouse_receipt_reconciliation_preview_v4(azienda);
    IF jsonb_array_length(piano->'blocked') <> 0
    THEN RAISE EXCEPTION 'Ricezioni pregresse non attribuibili. Migrazione annullata.'; END IF;
    IF jsonb_array_length(piano->'rows') = 0 THEN CONTINUE; END IF;
    IF azienda <> 'd2000000-0000-4000-a000-000000000002'
      OR (piano->>'legacy_balances')::integer <> 59 OR (piano->>'counter_alignments')::integer <> 1
    THEN RAISE EXCEPTION 'Ricezioni pregresse diverse dal preflight. Migrazione annullata.'; END IF;
    PERFORM public.warehouse_receipt_reconciliation_apply_v4(azienda, piano->>'source_hash', operazione);
    UPDATE public.warehouse_receipt_reconciliations_v4
      SET result = result || jsonb_build_object('anteprima', piano)
      WHERE id = operazione AND company_id = azienda;
    piano := public.warehouse_receipt_reconciliation_preview_v4(azienda);
    IF jsonb_array_length(piano->'rows') <> 0 OR jsonb_array_length(piano->'blocked') <> 0
    THEN RAISE EXCEPTION 'Riconciliazione incompleta. Migrazione annullata.'; END IF;
  END LOOP;
END
$riconciliazione$;

COMMIT;
