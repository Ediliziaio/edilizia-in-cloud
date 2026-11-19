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
