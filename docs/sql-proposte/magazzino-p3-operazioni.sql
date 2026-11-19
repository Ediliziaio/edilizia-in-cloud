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
