-- Fixture sintetica; non rappresenta RLS, automazioni o trigger globali della piattaforma.
DO $$ BEGIN IF current_database()<>'eic_magazzino_p2' THEN RAISE EXCEPTION 'Database locale richiesto'; END IF; END $$;
ALTER TABLE public.ddt_ricezione ADD COLUMN IF NOT EXISTS purchase_order_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS indirizzo_lavori text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS work_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id uuid;
CREATE TABLE IF NOT EXISTS public.profiles(id uuid PRIMARY KEY,first_name text,last_name text);
CREATE TABLE IF NOT EXISTS public.documenti_fiscali(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,tipo text,numero text,numero_progressivo integer,anno integer,data_emissione date,stato text,ordine_id uuid,anagrafica_id uuid,cliente_snapshot jsonb,righe jsonb,note_documento text,ddt_causale_trasporto text,ddt_aspetto_beni text,ddt_numero_colli integer,ddt_peso text,ddt_mezzo_trasporto text,ddt_porto text,ddt_vettore jsonb,ddt_indirizzo_consegna jsonb,UNIQUE(company_id,tipo,numero));
CREATE TABLE IF NOT EXISTS public.fixture_ddt_numbers(company_id uuid PRIMARY KEY,n integer DEFAULT 0);
-- Solo il generatore fiscale e l'insieme dei permessi sono surrogati nella fixture.
CREATE OR REPLACE FUNCTION public.genera_numero_documento_native(c uuid,t text,y integer) RETURNS text LANGUAGE plpgsql AS $$ DECLARE n integer; BEGIN INSERT INTO public.fixture_ddt_numbers VALUES(c,1) ON CONFLICT(company_id) DO UPDATE SET n=fixture_ddt_numbers.n+1 RETURNING fixture_ddt_numbers.n INTO n; RETURN 'DDT-'||y||'-'||n; END $$;
CREATE OR REPLACE FUNCTION public.puo_gestire_documento_fiscale(c uuid,t text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.fixture_permissions WHERE actor=auth.uid() AND company=c AND permission IN ('can_view_warehouse','can_edit_orders','can_view_billing')) $$;
CREATE OR REPLACE FUNCTION public.user_can_write_accountant_company(c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.riga_e_su_misura(i uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT coalesce((SELECT gruppo_id IS NOT NULL OR measure_status IS NOT NULL FROM public.order_items WHERE id=i),false) $$;
CREATE TABLE IF NOT EXISTS public.goods_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_item_id uuid,warehouse_id uuid,company_id uuid,supplier_id uuid,quantity_received integer NOT NULL,ddt_number text,ddt_photo_url text,quality_check_status text,quality_notes text,notes text,received_by uuid,ddt_ricezione_id uuid);
CREATE TABLE IF NOT EXISTS public.order_item_timeline(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_item_id uuid,company_id uuid,event_type text,event_by uuid,photo_url text,document_ref uuid,notes text,location text);

CREATE OR REPLACE FUNCTION public.receive_from_oda_via_scans(p_oda_id uuid, p_warehouse_id uuid, p_scans jsonb, p_ddt_number text DEFAULT NULL::text, p_ddt_ricezione_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shipped_items integer, created_units integer, oda_now_complete boolean, errors jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID := public.get_my_company_id();
  v_supplier_id UUID; v_oda_number TEXT; v_scan JSONB;
  v_oda_item_id UUID; v_item_id UUID; v_qty NUMERIC; v_serials JSONB; v_serial TEXT; v_tracking TEXT;
  v_ordered NUMERIC; v_already NUMERIC; v_residual NUMERIC;
  v_shipped INTEGER := 0; v_units INTEGER := 0; v_errors JSONB := '[]'::JSONB; v_all_received BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized: no auth.uid()'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company context for user'; END IF;

  SELECT supplier_id, oda_number INTO v_supplier_id, v_oda_number
    FROM public.purchase_orders WHERE id = p_oda_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ODA non valida o non appartenente alla company'; END IF;

  FOR v_scan IN SELECT * FROM jsonb_array_elements(p_scans)
  LOOP
    BEGIN
      v_oda_item_id := NULLIF(v_scan->>'oda_item_id', '')::UUID;
      v_item_id := (v_scan->>'stock_item_id')::UUID;
      v_qty := COALESCE((v_scan->>'quantity')::NUMERIC, 1);
      v_serials := v_scan->'serial_numbers';

      SELECT tracking_mode INTO v_tracking FROM public.warehouse_stock WHERE id = v_item_id AND company_id = v_company_id;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object('stock_item_id', v_item_id, 'error', 'item_not_found');
        CONTINUE;
      END IF;

      IF v_oda_item_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.purchase_order_items p
            WHERE p.id = v_oda_item_id AND p.purchase_order_id = p_oda_id AND public.riga_e_su_misura(p.order_item_id)) THEN
        v_errors := v_errors || jsonb_build_object('oda_item_id', v_oda_item_id, 'error', 'su_misura_si_registra_per_posizione');
        CONTINUE;
      END IF;

      -- CAP (P1c): non ricevere più del residuo ordinato sulla riga ODA. Senza questo
      -- una ricezione (o un retry) poteva portare quantity_received oltre quantity e
      -- caricare stock fantasma. Se già completa, salto la riga.
      IF v_oda_item_id IS NOT NULL THEN
        SELECT quantity, COALESCE(quantity_received,0) INTO v_ordered, v_already
          FROM public.purchase_order_items WHERE id = v_oda_item_id AND purchase_order_id = p_oda_id;
        IF FOUND THEN
          v_residual := COALESCE(v_ordered,0) - v_already;
          IF v_residual <= 0 THEN
            v_errors := v_errors || jsonb_build_object('oda_item_id', v_oda_item_id, 'error', 'already_fully_received');
            CONTINUE;
          END IF;
          IF v_qty > v_residual THEN v_qty := v_residual; END IF;
        END IF;
      END IF;

      IF v_oda_item_id IS NOT NULL THEN
        UPDATE public.purchase_order_items
           SET quantity_received = coalesce(quantity_received, 0) + v_qty, received_date = CURRENT_DATE
         WHERE id = v_oda_item_id AND purchase_order_id = p_oda_id;
      END IF;

      INSERT INTO public.warehouse_movements(stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id)
      VALUES (v_item_id, 'carico', v_qty::INTEGER, 'Carico da ODA ' || COALESCE(v_oda_number, ''), auth.uid(), v_company_id, p_warehouse_id);

      UPDATE public.warehouse_stock
         SET quantity = quantity + v_qty, supplier_id = COALESCE(supplier_id, v_supplier_id),
             warehouse_id = COALESCE(warehouse_id, p_warehouse_id), last_delivery_date = CURRENT_DATE, updated_at = now()
       WHERE id = v_item_id;

      IF v_tracking = 'serialized' AND v_serials IS NOT NULL AND jsonb_array_length(v_serials) > 0 THEN
        FOR v_serial IN SELECT * FROM jsonb_array_elements_text(v_serials)
        LOOP
          BEGIN
            INSERT INTO public.stock_units(company_id, stock_item_id, serial_number, status, warehouse_id, supplier_id, purchase_ddt_ricezione_id, purchase_date, created_by)
            VALUES (v_company_id, v_item_id, v_serial, 'available', p_warehouse_id, v_supplier_id, p_ddt_ricezione_id, CURRENT_DATE, auth.uid());
            v_units := v_units + 1;
          EXCEPTION WHEN unique_violation THEN
            v_errors := v_errors || jsonb_build_object('serial_number', v_serial, 'error', 'duplicate');
          END;
        END LOOP;
      END IF;

      INSERT INTO public.warehouse_scan_events(company_id, user_id, warehouse_id, scanned_code, scan_type, resolved_stock_item_id, resolution_status, supplier_id, purchase_order_id, quantity)
      VALUES (v_company_id, auth.uid(), p_warehouse_id, COALESCE(v_scan->>'raw_code', ''), 'oda_receive', v_item_id, 'matched', v_supplier_id, p_oda_id, v_qty);

      v_shipped := v_shipped + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('scan', v_scan, 'error', SQLERRM);
    END;
  END LOOP;

  SELECT NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id = p_oda_id AND coalesce(quantity_received, 0) < coalesce(quantity, 0)) INTO v_all_received;

  IF v_all_received THEN
    UPDATE public.purchase_orders SET status = 'ricevuto', actual_delivery_date = CURRENT_DATE, updated_at = now() WHERE id = p_oda_id AND status <> 'annullato' AND (v_shipped > 0 OR status = 'ricevuto');
  ELSE
    UPDATE public.purchase_orders SET status = 'parziale', updated_at = now() WHERE id = p_oda_id AND status IN ('inviato', 'confermato');
  END IF;

  RETURN QUERY SELECT v_shipped, v_units, v_all_received, v_errors;
END;
$function$
;
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

  SELECT * INTO v_u FROM public.warehouse_uscite WHERE id = p_uscita_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uscita non trovata'; END IF;
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
        IF v_ricevuto_bolle <> v_ricevuto_oda THEN
          RAISE EXCEPTION 'Ricezioni e residuo dell’ordine non allineati: riconciliare prima di registrare altra merce';
        END IF;
        IF p_quantity_received > v_ordinato-v_ricevuto_bolle THEN
          RAISE EXCEPTION 'La quantità supera il residuo dell’ordine';
        END IF;
      END IF;
    END IF;
    PERFORM 1 FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  END;

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
;

ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS receipt_date date DEFAULT current_date;
CREATE OR REPLACE FUNCTION public.trg_goods_receipt_muove_oda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_item uuid;
  v_company uuid;
  v_po uuid;
  v_quanti int;
begin
  v_order_item := coalesce(new.order_item_id, old.order_item_id);
  v_company := coalesce(new.company_id, old.company_id);

  -- L'ordine lo dice il DDT, quando c'e': e' il segnale esplicito.
  -- (Anche qui: mai oltre il confine dell'azienda della ricezione.)
  if coalesce(new.ddt_ricezione_id, old.ddt_ricezione_id) is not null then
    select purchase_order_id into v_po
      from ddt_ricezione
     where id = coalesce(new.ddt_ricezione_id, old.ddt_ricezione_id)
       and company_id = v_company;
  end if;

  -- Senza DDT: l'ordine collegato all'articolo — solo se e' UNO solo,
  -- e della stessa azienda della ricezione.
  if v_po is null then
    select count(distinct purchase_order_id), min(purchase_order_id::text)::uuid
      into v_quanti, v_po
      from purchase_order_items
     where order_item_id = v_order_item
       and company_id = v_company;
    if coalesce(v_quanti, 0) <> 1 then
      return coalesce(new, old); -- zero o piu' ordini: ambiguo, non si indovina
    end if;
  end if;

  perform ricalcola_ricezione_oda(v_po);
  return coalesce(new, old);
end;
$function$
;
DROP TRIGGER IF EXISTS trg_goods_receipts_muove_oda ON public.goods_receipts;
CREATE TRIGGER trg_goods_receipts_muove_oda AFTER INSERT OR DELETE OR UPDATE OF quantity_received ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.trg_goods_receipt_muove_oda();
CREATE OR REPLACE FUNCTION public.auto_carico_stock_on_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stock_id    uuid;
  v_item_name   text;
  v_supplier_id uuid;
  v_unit_cost   numeric;
  v_su_misura   boolean;
begin
  -- Solo stati che corrispondono a merce effettivamente in magazzino.
  if new.quality_check_status is null
     or new.quality_check_status not in ('ok', 'partial') then
    return new;
  end if;

  -- Fallback silenzioso: se warehouse_id non è valorizzato non facciamo nulla.
  if new.warehouse_id is null or new.quantity_received is null or new.quantity_received <= 0 then
    return new;
  end if;

  select oi.name, oi.supplier_id, oi.purchase_price, (oi.measure_status is not null or oi.gruppo_id is not null)
    into v_item_name, v_supplier_id, v_unit_cost, v_su_misura
  from public.order_items oi
  where oi.id = new.order_item_id;

  if v_item_name is null then
    -- order_item cancellato nel frattempo: non scriviamo stock "orfano".
    return new;
  end if;

  if v_su_misura then
    return new;
  end if;

  -- warehouse_stock esistente per (company, warehouse, nome) — case-sensitive
  select id into v_stock_id from public.warehouse_stock
  where company_id = new.company_id
    and warehouse_id = new.warehouse_id
    and name = v_item_name
  limit 1;

  if v_stock_id is null then
    insert into public.warehouse_stock (
      company_id, warehouse_id, name, quantity, unit_cost, supplier_id
    ) values (
      new.company_id, new.warehouse_id, v_item_name,
      new.quantity_received, coalesce(v_unit_cost, 0), v_supplier_id
    )
    returning id into v_stock_id;
  else
    update public.warehouse_stock
       set quantity   = quantity + new.quantity_received,
           updated_at = now()
     where id = v_stock_id;
  end if;

  insert into public.warehouse_movements (
    stock_item_id, order_item_id, movement_type, quantity,
    performed_by, warehouse_id, notes, company_id
  ) values (
    v_stock_id, new.order_item_id, 'carico', new.quantity_received,
    new.received_by, new.warehouse_id,
    'Auto-carico da goods_receipt ' || new.id::text,
    new.company_id
  );

  return new;
end;
$function$
;
-- Questo trigger chiama la stessa funzione della proposta; non è un mock del carico.
DROP TRIGGER IF EXISTS trg_auto_carico_stock ON public.goods_receipts;
CREATE TRIGGER trg_auto_carico_stock AFTER INSERT ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.auto_carico_stock_on_receipt();
