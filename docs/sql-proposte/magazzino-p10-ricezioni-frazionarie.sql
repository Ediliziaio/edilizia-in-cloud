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
