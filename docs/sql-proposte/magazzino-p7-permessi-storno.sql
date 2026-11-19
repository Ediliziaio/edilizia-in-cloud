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
