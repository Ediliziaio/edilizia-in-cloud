-- Ambiente di collaudo isolato; solo dati sintetici. NON eseguire su altri database.
DO $$ BEGIN IF current_database() <> 'eic_magazzino_p2' THEN RAISE EXCEPTION 'Database di collaudo richiesto'; END IF; END $$;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.companies(id uuid PRIMARY KEY, name text);
CREATE TABLE public.customers(id uuid PRIMARY KEY, company_id uuid NOT NULL);
CREATE TABLE public.orders(id uuid PRIMARY KEY,company_id uuid NOT NULL,assigned_to uuid,destination_warehouse_id uuid,deleted_at timestamptz);
CREATE TABLE public.campo_rapportini(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,stato text,materiali_usati jsonb);
CREATE TABLE public.fixture_permissions(actor uuid,company uuid,permission text,PRIMARY KEY(actor,company,permission));
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION public.has_permission_for_company(a uuid,p text,c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.fixture_permissions WHERE actor=a AND company=c AND permission=p) $$;
CREATE OR REPLACE FUNCTION public.e_super_admin_dentro(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.can_see_order(o uuid,a uuid,w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.orders x JOIN public.fixture_permissions p ON p.company=x.company_id AND p.actor=auth.uid() AND p.permission='can_view_orders' WHERE x.id=o) $$;
CREATE TABLE public.order_items (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"order_id" uuid NOT NULL,
"name" text NOT NULL,
"description" text,
"quantity" numeric DEFAULT 1,
"status" text DEFAULT 'da_ordinare'::text,
"position" int4 DEFAULT 0,
"created_at" timestamptz DEFAULT now(),
"updated_at" timestamptz DEFAULT now(),
"supplier_id" uuid,
"purchase_price" numeric DEFAULT 0,
"vat_rate" numeric DEFAULT 22,
"stock_item_id" uuid,
"is_paid" bool DEFAULT false,
"paid_date" date,
"unit_price" numeric DEFAULT 0,
"discount_percent" numeric DEFAULT 0,
"standard_cost" numeric DEFAULT 0,
"payment_method" text,
"deposit_amount" numeric DEFAULT 0,
"deposit_paid" bool DEFAULT false,
"deposit_paid_date" date,
"balance_amount" numeric DEFAULT 0,
"balance_paid" bool DEFAULT false,
"balance_paid_date" date,
"balance_expected_date" date,
"deposit_expected_date" date,
"notes" text,
"section_id" uuid,
"lot_number" text,
"delivery_date" date,
"quantity_reserved" int4 DEFAULT 0,
"auto_deducted" bool DEFAULT false,
"destination_warehouse_id" uuid,
"quantity_received" numeric DEFAULT 0,
"receipt_id" uuid,
"last_goods_receipt_date" timestamp,
"shipment_id" uuid,
"last_shipment_date" timestamp,
"installation_id" uuid,
"fulfillment_status" text DEFAULT 'not_started'::text,
"product_code" text,
"article_template_id" uuid,
"categoria" text,
"phase_id" uuid,
"family_id" uuid,
"axis_selections" jsonb,
"misure_preventivo" jsonb,
"misure_rilevate" jsonb,
"measure_status" text,
"measure_variance" jsonb,
"survey_id" uuid,
"survey_element_id" uuid,
"posizioni" jsonb,
"natura_riga" text DEFAULT 'materiale'::text NOT NULL,
"unita_misura" text,
"specifiche" text,
"origine_materiale" text,
"quantita_netta" numeric,
"quantita_calcolata" numeric,
"sfrido" numeric,
"origini" jsonb,
"chiave_materiale" text,
"computo_voce_id" uuid,
"scomposizione_id" uuid,
"planimetria_documento_id" uuid,
"locale" text,
"supplier_rfq_item_id" uuid,
"prezzo_fonte" text,
"prezzo_aggiornato_il" timestamptz,
"data_fabbisogno" date,
"gruppo_id" uuid,
"riferimento" text,
"prezzo_prima_ordine" jsonb,
"misure_da_ordinare" jsonb,
"misura_tipo" text,
"componente" text,
"diviso_da" uuid,
"misura_forma" text,
"gioco_posa_mm" numeric,
"costo_stimato_iniziale" numeric,
"ddt_riga_origine_id" uuid,
"prezzo_da_definire" bool DEFAULT false NOT NULL
);
CREATE TABLE public.stock_units (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"stock_item_id" uuid NOT NULL,
"serial_number" text NOT NULL,
"lotto_id" uuid,
"status" text DEFAULT 'available'::text NOT NULL,
"warehouse_id" uuid,
"section_id" uuid,
"supplier_id" uuid,
"purchase_price" numeric,
"purchase_ddt_ricezione_id" uuid,
"purchase_date" date,
"reserved_order_id" uuid,
"delivered_shipment_id" uuid,
"delivered_at" timestamptz,
"delivered_to_order_id" uuid,
"warranty_start_date" date,
"warranty_months" int4,
"warranty_expires_at" date,
"manufacturer_warranty_code" text,
"installed_at" timestamptz,
"installed_at_location" text,
"installed_by_user_id" uuid,
"created_by" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL,
"notes" text,
"reserved_order_item_id" uuid,
"delivered_order_item_id" uuid
);
CREATE TABLE public.warehouse_movements (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"stock_item_id" uuid NOT NULL,
"order_item_id" uuid,
"movement_type" text NOT NULL,
"quantity" numeric NOT NULL,
"notes" text,
"performed_by" uuid NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL,
"order_id" uuid,
"lot_number" text,
"unit_cost" numeric,
"company_id" uuid NOT NULL,
"warehouse_id" uuid,
"uscita_id" uuid,
"rientro_commessa" bool DEFAULT false NOT NULL,
"da_prelievo" bool DEFAULT false NOT NULL,
"valorizza_medio" bool DEFAULT true NOT NULL,
"medio_prima" numeric,
"costo_provvisorio" bool DEFAULT false NOT NULL
);
CREATE TABLE public.warehouse_scan_events (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"warehouse_id" uuid,
"scanned_code" text NOT NULL,
"scan_format" text,
"scan_type" text NOT NULL,
"resolved_stock_item_id" uuid,
"resolved_stock_unit_id" uuid,
"resolution_status" text NOT NULL,
"supplier_id" uuid,
"order_id" uuid,
"purchase_order_id" uuid,
"quantity" numeric,
"gps_latitude" numeric,
"gps_longitude" numeric,
"device_info" jsonb,
"synced_from_offline" bool DEFAULT false NOT NULL,
"offline_client_uuid" uuid,
"offline_timestamp" timestamptz,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE public.warehouse_stock (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"name" text NOT NULL,
"description" text,
"quantity" numeric DEFAULT 0 NOT NULL,
"unit_cost" numeric DEFAULT 0 NOT NULL,
"vat_rate" numeric DEFAULT 22,
"supplier_id" uuid,
"min_stock_level" int4 DEFAULT 0 NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL,
"section_id" uuid,
"quantity_reserved" numeric DEFAULT 0 NOT NULL,
"reorder_quantity" int4 DEFAULT 0 NOT NULL,
"last_delivery_date" date,
"last_lot_number" text,
"warehouse_id" uuid,
"barcode" text,
"internal_code" text,
"tracking_mode" text DEFAULT 'fungible'::text NOT NULL,
"requires_warranty" bool DEFAULT false NOT NULL,
"default_warranty_months" int4,
"qr_generated_at" timestamptz,
"article_family_id" uuid,
"quantity_available" numeric GENERATED ALWAYS AS (GREATEST((0)::numeric, (quantity - quantity_reserved))) STORED,
"unita_misura" text,
"prezzo_da_definire" bool DEFAULT false NOT NULL,
"costo_ricalcolo_sospeso" text,
"costo_ricalcolo_sospeso_at" timestamptz
);
CREATE TABLE public.warehouse_uscite (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"warehouse_id" uuid,
"numero" text NOT NULL,
"numero_seq" int4 NOT NULL,
"anno" int4 NOT NULL,
"data" date DEFAULT CURRENT_DATE NOT NULL,
"destinatario_tipo" text NOT NULL,
"customer_id" uuid,
"order_id" uuid,
"destinatario_libero" jsonb,
"cliente_snapshot" jsonb,
"vettore" jsonb,
"note" text,
"righe" jsonb DEFAULT '[]'::jsonb NOT NULL,
"stato" text DEFAULT 'registrata'::text NOT NULL,
"documento_id" uuid,
"created_by" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE public.warehouses (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"name" text NOT NULL,
"type" text DEFAULT 'main'::text NOT NULL,
"address" text,
"city" text,
"province" text,
"postal_code" text,
"contact_name" text,
"contact_phone" text,
"is_active" bool DEFAULT true NOT NULL,
"is_default" bool DEFAULT false NOT NULL,
"linked_order_id" uuid,
"position" int4 DEFAULT 0 NOT NULL,
"notes" text,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL
);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;

-- Purchase valuation is outside this fixture: explicit costs are seeded for every movement.
CREATE FUNCTION public.magazzino_prezzo_acquisto_riga(uuid,numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT NULL::numeric $$;
CREATE OR REPLACE FUNCTION public.magazzino_valorizza_medio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_giacenza numeric;
  v_medio numeric;
  v_nuovo numeric;
begin
  if new.movement_type <> 'carico'
     or not coalesce(new.valorizza_medio, true)
     or coalesce(new.quantity, 0) <= 0
     or coalesce(new.unit_cost, 0) <= 0
     or new.stock_item_id is null then
    return new;
  end if;

  select ws.unit_cost into v_medio
    from public.warehouse_stock ws
   where ws.id = new.stock_item_id
     for update;
  if not found then
    return new;
  end if;

  select coalesce(sum(case when m.movement_type = 'carico' then m.quantity else -m.quantity end), 0)
    into v_giacenza
    from public.warehouse_movements m
   where m.stock_item_id = new.stock_item_id;

  -- Congelato sulla riga: dopo l'aggiornamento della scheda il medio di prima
  -- non è più leggibile da nessuna parte, e l'AFTER ne ha bisogno.
  new.medio_prima := v_medio;

  v_nuovo := public.magazzino_medio_ponderato(v_giacenza, v_medio, new.quantity, new.unit_cost);

  if v_nuovo is not null and abs(v_nuovo - coalesce(v_medio, 0)) > 0.00005 then
    update public.warehouse_stock
       set unit_cost = v_nuovo, updated_at = now()
     where id = new.stock_item_id;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.order_items_magazzino_pezzi_interi()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.stock_item_id is not null and new.quantity is not null and new.quantity <> trunc(new.quantity) then
    raise exception '«%» è un articolo di magazzino: si scarica a pezzi interi, non %.',
      coalesce(new.name, 'Questa riga'), replace(trim(trailing '.' from trim(trailing '0' from new.quantity::text)), '.', ',')
      using errcode = '22023';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.trg_auto_deduct_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    IF NEW.quantity IS NULL OR NEW.quantity<=0 OR NEW.quantity<>trunc(NEW.quantity) THEN
      RAISE EXCEPTION 'Verifica la quantità: lo scarico automatico richiede unità intere positive';
    END IF;
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    PERFORM public.magazzino_collega_prelievi(v_company, NEW.order_id, NEW.id, NEW.stock_item_id,
                                              greatest(NEW.quantity - greatest(v_used, 0), 0));
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    v_remaining := greatest(NEW.quantity-greatest(v_used,0),0);
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
CREATE OR REPLACE FUNCTION public.trg_oi_reserve_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.stock_item_id is not null and public.fulfillment_status_holds_reserve(old.fulfillment_status) and coalesce(old.quantity, 0) > 0 then
    update public.warehouse_stock set quantity_reserved = greatest(0, quantity_reserved - ceil(old.quantity)::integer), updated_at = now()
     where id = old.stock_item_id;
  end if;
  return old;
end;
$function$;
CREATE OR REPLACE FUNCTION public.trg_oi_reserve_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.stock_item_id is not null and public.fulfillment_status_holds_reserve(new.fulfillment_status) and coalesce(new.quantity, 0) > 0 then
    update public.warehouse_stock set quantity_reserved = quantity_reserved + ceil(new.quantity)::integer, updated_at = now()
     where id = new.stock_item_id;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.trg_oi_reserve_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_held boolean := public.fulfillment_status_holds_reserve(old.fulfillment_status);
  v_new_held boolean := public.fulfillment_status_holds_reserve(new.fulfillment_status);
begin
  if not v_old_held and not v_new_held then
    return new;
  end if;
  if v_old_held and old.stock_item_id is not null and coalesce(old.quantity, 0) > 0 and (
       not v_new_held or old.stock_item_id is distinct from new.stock_item_id or old.quantity is distinct from new.quantity) then
    update public.warehouse_stock set quantity_reserved = greatest(0, quantity_reserved - ceil(old.quantity)::integer), updated_at = now()
     where id = old.stock_item_id;
  end if;
  if v_new_held and new.stock_item_id is not null and coalesce(new.quantity, 0) > 0 and (
       not v_old_held or old.stock_item_id is distinct from new.stock_item_id or old.quantity is distinct from new.quantity) then
    update public.warehouse_stock set quantity_reserved = quantity_reserved + ceil(new.quantity)::integer, updated_at = now()
     where id = new.stock_item_id;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.warehouse_movement_snapshot_unit_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_prezzo numeric;
  v_costo numeric;
  v_da_definire boolean;
  v_trovato boolean;
  v_fotografato boolean := false;
begin
  if new.unit_cost is null then
    if new.movement_type = 'carico'
       and new.order_item_id is not null
       and not coalesce(new.rientro_commessa, false) then
      v_prezzo := public.magazzino_prezzo_acquisto_riga(new.order_item_id, new.quantity);
      if coalesce(v_prezzo, 0) > 0 then
        new.unit_cost := round(v_prezzo, 4);
        return new;
      end if;
    end if;
  elsif new.movement_type is distinct from 'scarico' then
    return new;
  end if;

  select ws.unit_cost, coalesce(ws.prezzo_da_definire, false)
    into v_costo, v_da_definire
    from public.warehouse_stock ws
   where ws.id = new.stock_item_id
     and (new.company_id is null or ws.company_id = new.company_id);
  v_trovato := found;

  if new.unit_cost is null then
    new.unit_cost := v_costo;
    v_fotografato := true;
  end if;

  if v_trovato
     and new.movement_type = 'scarico'
     and not coalesce(new.rientro_commessa, false)
     and coalesce(new.valorizza_medio, true)
     and (v_fotografato or new.unit_cost is not distinct from v_costo)
     and (v_da_definire or coalesce(new.unit_cost, 0) = 0) then
    new.costo_provvisorio := true;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.fulfillment_status_holds_reserve(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT p_status = 'received';
$function$;
CREATE OR REPLACE FUNCTION public.magazzino_collega_prelievi(p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_quanto numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_serve numeric := greatest(coalesce(p_quanto, 0), 0); v_preso numeric := 0; m record;
begin
  if p_riga is null or p_articolo is null or p_commessa is null or v_serve <= 0 then return 0; end if;
  for m in
    select id, quantity from public.warehouse_movements
     where stock_item_id = p_articolo and order_id = p_commessa and company_id = p_company
       and order_item_id is null and movement_type = 'scarico'
     order by created_at, id
     for update
  loop
    exit when v_serve <= 0;
    if m.quantity <= v_serve then
      update public.warehouse_movements set order_item_id = p_riga, da_prelievo = true where id = m.id;
      v_serve := v_serve - m.quantity;
      v_preso := v_preso + m.quantity;
    else
      insert into public.warehouse_movements
        (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, created_at, order_id,
         lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa, da_prelievo)
      select stock_item_id, null, movement_type, quantity - v_serve, notes, performed_by, created_at, order_id,
             lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa, false
        from public.warehouse_movements where id = m.id;
      update public.warehouse_movements set quantity = v_serve, order_item_id = p_riga, da_prelievo = true where id = m.id;
      v_preso := v_preso + v_serve;
      v_serve := 0;
    end if;
  end loop;
  return v_preso;
end $function$;
CREATE OR REPLACE FUNCTION public.magazzino_medio_ponderato(p_giacenza numeric, p_medio numeric, p_entrata numeric, p_prezzo numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    -- Niente entrata: il medio non si muove.
    when coalesce(p_entrata, 0) <= 0 then coalesce(p_medio, 0)
    -- Prezzo mancante (o zero: le rettifiche e i carichi senza bolla arrivano
    -- così): non si inventa un valore, resta il medio di prima. Meglio un medio
    -- vecchio che un magazzino svalutato per una casella vuota.
    when coalesce(p_prezzo, 0) <= 0 then coalesce(p_medio, 0)
    -- Giacenza a zero o negativa (scarichi oltre i carichi): non c'è nulla con
    -- cui fare la media, vale il prezzo appena pagato.
    when coalesce(p_giacenza, 0) <= 0 then round(p_prezzo, 4)
    -- Scheda senza valore: la media partirebbe da zero e abbasserebbe tutto.
    when coalesce(p_medio, 0) <= 0 then round(p_prezzo, 4)
    else round(
      (p_giacenza * p_medio + p_entrata * p_prezzo)
      / nullif(p_giacenza + p_entrata, 0), 4)
  end
$function$;
CREATE OR REPLACE FUNCTION public.magazzino_scaricato_riga(p_riga uuid, p_articolo uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(case when m.movement_type = 'scarico' then m.quantity
                           when m.movement_type = 'carico' and m.rientro_commessa then -m.quantity
                           else 0 end), 0)
    from public.warehouse_movements m
   where m.order_item_id = p_riga and m.stock_item_id = p_articolo and m.order_id is not null
$function$;
CREATE OR REPLACE FUNCTION public.unita_confrontabile(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case k
    when '' then 'pz' when 'pz.' then 'pz' when 'pezzi' then 'pz' when 'pezzo' then 'pz' when 'cad' then 'pz' when 'cad.' then 'pz' when 'n' then 'pz' when 'nr' then 'pz'
    when 'sacchi' then 'sacco' when 'confezioni' then 'confezione' when 'rotoli' then 'rotolo' when 'secchi' then 'secchio'
    when 'bancali' then 'bancale' when 'm²' then 'mq' when 'm2' then 'mq' when 'm³' then 'mc' when 'm3' then 'mc'
    when 'litri' then 'l' when 'litro' then 'l' when 'corpo' then 'a corpo' when 'ac' then 'a corpo' when 'a.c.' then 'a corpo'
    else k end
  from (select lower(btrim(coalesce(p, ''))) k) x
$function$;
CREATE TRIGGER oi_reserve_on_delete AFTER DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION trg_oi_reserve_on_delete();
CREATE TRIGGER oi_reserve_on_insert AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION trg_oi_reserve_on_insert();
CREATE TRIGGER oi_reserve_on_update AFTER UPDATE OF fulfillment_status, stock_item_id, quantity ON public.order_items FOR EACH ROW EXECUTE FUNCTION trg_oi_reserve_on_update();
CREATE TRIGGER order_items_magazzino_pezzi_interi BEFORE INSERT OR UPDATE OF quantity, stock_item_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION order_items_magazzino_pezzi_interi();
CREATE TRIGGER trg_order_item_auto_deduct BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION trg_auto_deduct_stock();
CREATE TRIGGER trg_warehouse_movement_snapshot_unit_cost BEFORE INSERT ON public.warehouse_movements FOR EACH ROW EXECUTE FUNCTION warehouse_movement_snapshot_unit_cost();
CREATE TRIGGER trg_warehouse_movimento_valorizza_medio BEFORE INSERT ON public.warehouse_movements FOR EACH ROW EXECUTE FUNCTION magazzino_valorizza_medio();
ALTER TABLE public.order_items ADD CONSTRAINT order_items_fulfillment_status_check CHECK ((fulfillment_status = ANY (ARRAY['not_started'::text, 'received'::text, 'shipped'::text, 'delivered'::text, 'installed'::text])));
ALTER TABLE public.order_items ADD CONSTRAINT order_items_measure_status_chk CHECK (((measure_status IS NULL) OR (measure_status = ANY (ARRAY['da_rilevare'::text, 'rilevato'::text, 'confermato'::text]))));
ALTER TABLE public.order_items ADD CONSTRAINT order_items_misura_forma_check CHECK (((misura_forma IS NULL) OR (misura_forma = ANY (ARRAY['LxH'::text, 'LxPxH'::text, 'mq'::text, 'ml'::text, 'm'::text, 'pz'::text]))));
ALTER TABLE public.order_items ADD CONSTRAINT order_items_misura_tipo_check CHECK (((misura_tipo IS NULL) OR (misura_tipo = ANY (ARRAY['foro'::text, 'telaio'::text, 'finita'::text]))));
ALTER TABLE public.order_items ADD CONSTRAINT order_items_natura_riga_check CHECK ((natura_riga = ANY (ARRAY['materiale'::text, 'lavorazione'::text, 'descrizione'::text])));
ALTER TABLE public.order_items ADD CONSTRAINT order_items_origine_materiale_check CHECK (((origine_materiale IS NULL) OR (origine_materiale = ANY (ARRAY['computo'::text, 'planimetria'::text, 'manuale'::text]))));
ALTER TABLE public.order_items ADD CONSTRAINT order_items_prezzo_fonte_check CHECK (((prezzo_fonte IS NULL) OR (prezzo_fonte = ANY (ARRAY['listino'::text, 'ultimo_acquisto'::text, 'scomposizione'::text, 'offerta'::text, 'ordine'::text, 'manuale'::text]))));
ALTER TABLE public.warehouse_stock ADD CONSTRAINT warehouse_stock_quantity_non_negativa CHECK ((quantity >= (0)::numeric));
ALTER TABLE public.warehouse_stock ADD CONSTRAINT warehouse_stock_tracking_mode_check CHECK ((tracking_mode = ANY (ARRAY['fungible'::text, 'serialized'::text])));
ALTER TABLE public.stock_units ADD CONSTRAINT stock_units_status_check CHECK ((status = ANY (ARRAY['available'::text, 'reserved'::text, 'shipped'::text, 'installed'::text, 'returned'::text, 'defective'::text, 'scrapped'::text])));
ALTER TABLE public.warehouse_scan_events ADD CONSTRAINT warehouse_scan_events_resolution_status_check CHECK ((resolution_status = ANY (ARRAY['matched'::text, 'matched_ambiguous'::text, 'new_item_created'::text, 'unresolved'::text, 'rejected'::text])));
ALTER TABLE public.warehouse_scan_events ADD CONSTRAINT warehouse_scan_events_scan_type_check CHECK ((scan_type = ANY (ARRAY['lookup'::text, 'carico'::text, 'scarico'::text, 'inventario'::text, 'transfer'::text, 'return'::text, 'oda_receive'::text])));
ALTER TABLE public.warehouse_uscite ADD CONSTRAINT warehouse_uscite_destinatario_tipo_check CHECK ((destinatario_tipo = ANY (ARRAY['cliente'::text, 'cantiere'::text, 'libero'::text])));
ALTER TABLE public.warehouse_uscite ADD CONSTRAINT warehouse_uscite_stato_check CHECK ((stato = ANY (ARRAY['registrata'::text, 'ddt_creato'::text, 'annullata'::text])));

CREATE TABLE public.suppliers(id uuid PRIMARY KEY,company_id uuid);
CREATE TABLE public.warehouse_sections(id uuid PRIMARY KEY,company_id uuid,warehouse_id uuid);
CREATE TABLE public.ddt_ricezione(id uuid PRIMARY KEY,company_id uuid,warehouse_id uuid);
CREATE UNIQUE INDEX idx_stock_units_serial_company ON public.stock_units(company_id,serial_number);
CREATE UNIQUE INDEX idx_scan_events_offline_uuid ON public.warehouse_scan_events(offline_client_uuid) WHERE offline_client_uuid IS NOT NULL;

-- Ruoli e assegnazioni sintetiche per i test autorizzativi.
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM('super_admin','company_admin','company_staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.warehouse_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),warehouse_id uuid,user_id uuid,active boolean DEFAULT true);
CREATE TABLE IF NOT EXISTS public.multi_company_access(user_id uuid,company_id uuid,status text,expires_at timestamptz,access_role text);
CREATE OR REPLACE FUNCTION public.get_user_company_id(u uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT company FROM public.fixture_permissions WHERE actor=u ORDER BY company LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT r='company_admin' AND EXISTS(SELECT 1 FROM public.fixture_permissions WHERE actor=u AND permission='fixture_company_admin') $$;

-- Costo del carico libero: replica minima per il laboratorio sintetico.
-- I permessi/trigger reali vengono invece collaudati nella copia integrata.
CREATE TABLE IF NOT EXISTS public.company_costs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),
 name text NOT NULL,cost_type text,amount numeric NOT NULL,vat_rate numeric,supplier_id uuid,
 due_date date,is_paid boolean,paid_date date,category text,recurrence text,notes text
);
ALTER TABLE public.company_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_costs FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.utente_bloccato() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.utente_sola_lettura(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
