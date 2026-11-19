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
