DO $$ BEGIN IF current_database()<>'eic_magazzino_p2' THEN RAISE EXCEPTION 'Richiesto database locale di collaudo'; END IF; END $$;
CREATE TABLE IF NOT EXISTS public.warehouse_transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
company_id uuid NOT NULL,
from_warehouse_id uuid NOT NULL,
to_warehouse_id uuid NOT NULL,
status text DEFAULT 'bozza'::text NOT NULL,
transfer_date date DEFAULT CURRENT_DATE NOT NULL,
notes text,
created_by uuid,
created_at timestamptz DEFAULT now() NOT NULL,
updated_at timestamptz DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS public.warehouse_transfer_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
transfer_id uuid NOT NULL,
stock_item_id uuid NOT NULL,
quantity numeric NOT NULL,
quantity_received numeric DEFAULT 0 NOT NULL,
notes text,
sort_order int4 DEFAULT 0 NOT NULL,
created_at timestamptz DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS public.inventory_audits (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
company_id uuid NOT NULL,
stock_item_id uuid NOT NULL,
expected_quantity int4 NOT NULL,
counted_quantity int4 NOT NULL,
difference int4 GENERATED ALWAYS AS ((counted_quantity - expected_quantity)) STORED NOT NULL,
adjustment_applied bool DEFAULT false NOT NULL,
performed_by uuid NOT NULL,
notes text,
created_at timestamptz DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS public.purchase_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
company_id uuid NOT NULL,
supplier_id uuid NOT NULL,
oda_number text NOT NULL,
status text DEFAULT 'bozza'::text NOT NULL,
issue_date date DEFAULT CURRENT_DATE NOT NULL,
expected_delivery_date date,
actual_delivery_date date,
order_id uuid,
subtotal numeric DEFAULT 0 NOT NULL,
vat_total numeric DEFAULT 0 NOT NULL,
total numeric DEFAULT 0 NOT NULL,
payment_terms text,
payment_method text,
notes text,
internal_notes text,
attachment_url text,
created_by uuid,
created_at timestamptz DEFAULT now() NOT NULL,
updated_at timestamptz DEFAULT now() NOT NULL,
supplier_reference text,
delivery_address text,
sent_at timestamptz,
confirmed_at timestamptz,
delivery_warehouse_id uuid,
last_verification_id uuid,
origine text DEFAULT 'email'::text NOT NULL,
ticket_id uuid,
payment_terms_base text,
payment_terms_giorni int4,
document_details jsonb DEFAULT '{}'::jsonb NOT NULL,
ordina_comunque_motivo text,
ordina_comunque_il timestamptz,
ordina_comunque_da uuid,
ordina_comunque_righe uuid[],
conferma_sollecitata_il timestamptz);
CREATE TABLE IF NOT EXISTS public.purchase_order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
company_id uuid NOT NULL,
purchase_order_id uuid NOT NULL,
description text NOT NULL,
sku text,
unit_of_measure text DEFAULT 'pz'::text,
quantity numeric DEFAULT 1 NOT NULL,
unit_price numeric DEFAULT 0 NOT NULL,
discount_percent numeric DEFAULT 0 NOT NULL,
vat_rate numeric DEFAULT 22 NOT NULL,
line_total numeric GENERATED ALWAYS AS (round(((quantity * unit_price) * ((1)::numeric - (discount_percent / (100)::numeric))), 2)) STORED,
vat_amount numeric GENERATED ALWAYS AS (round(((((quantity * unit_price) * ((1)::numeric - (discount_percent / (100)::numeric))) * vat_rate) / (100)::numeric), 2)) STORED,
quantity_received numeric DEFAULT 0 NOT NULL,
received_date date,
article_template_id uuid,
sort_order int4 DEFAULT 0 NOT NULL,
notes text,
created_at timestamptz DEFAULT now() NOT NULL,
updated_at timestamptz DEFAULT now() NOT NULL,
order_item_id uuid,
warehouse_id uuid,
stock_item_id uuid,
price_pending bool DEFAULT false NOT NULL,
riordino_motivo text,
rfq_item_id uuid,
riferimento text,
misure jsonb,
misure_fonte text,
misura_tipo text,
colore text,
apertura text,
misure_testo text,
ripartito bool DEFAULT false NOT NULL);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 22;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_foreign bool DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS country text DEFAULT 'Italia'::text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS fiscal_code text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS product_category text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS lead_time_days int4 DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS min_order_amount numeric DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS credit_limit numeric;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS rating int4;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active bool DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS barcode_prefix text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS uses_gs1 bool DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS default_qr_format text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_role text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS altri_referenti jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email_ordini text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS pec text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS codice_sdi text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS termini_giorni int4;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS termini_fine_mese bool DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS codice_cliente text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sconto_percentuale numeric;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS ritiro_indirizzo text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS ritiro_citta text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS ritiro_note text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS subappaltatore_id uuid;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS inversione_contabile bool DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS oda_formato text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS oda_prossimo int4;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS creato_dalla_fattura_id uuid;
CREATE TABLE IF NOT EXISTS public.numerazione_ordini_fornitore(company_id uuid PRIMARY KEY,prossimo integer,formato text);
CREATE OR REPLACE FUNCTION public.user_can_access_company(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM fixture_permissions WHERE actor=auth.uid() AND company=c) $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_orders'::regclass AND conname='purchase_orders_origine_check') THEN ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_origine_check CHECK ((origine = ANY (ARRAY['email'::text, 'telefono'::text, 'portale'::text, 'documento'::text, 'negozio'::text]))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_orders'::regclass AND conname='purchase_orders_status_check') THEN ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['bozza'::text, 'inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text, 'annullato'::text]))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_orders'::regclass AND conname='purchase_orders_terms_base_check') THEN ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_terms_base_check CHECK (((payment_terms_base IS NULL) OR (payment_terms_base = ANY (ARRAY['data_fissa'::text, 'data_fattura'::text, 'fine_mese_fattura'::text, 'ricezione_merce'::text, 'data_ordine'::text, 'fine_lavori'::text])))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_orders'::regclass AND conname='uq_oda_number_company') THEN ALTER TABLE public.purchase_orders ADD CONSTRAINT uq_oda_number_company UNIQUE (company_id, oda_number); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_order_items'::regclass AND conname='purchase_order_items_pending_price_zero') THEN ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_pending_price_zero CHECK (((NOT price_pending) OR (unit_price = (0)::numeric))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_order_items'::regclass AND conname='purchase_order_items_quantity_check') THEN ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_quantity_check CHECK ((quantity > (0)::numeric)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.warehouse_transfers'::regclass AND conname='chk_different_warehouses') THEN ALTER TABLE public.warehouse_transfers ADD CONSTRAINT chk_different_warehouses CHECK ((from_warehouse_id <> to_warehouse_id)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.warehouse_transfers'::regclass AND conname='warehouse_transfers_status_check') THEN ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_status_check CHECK ((status = ANY (ARRAY['bozza'::text, 'confermato'::text, 'in_transito'::text, 'ricevuto'::text, 'annullato'::text]))); END IF; END $$;
CREATE OR REPLACE FUNCTION public.oda_formatta_numero(p_formato text, p_n integer, p_data date)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  r text := coalesce(nullif(btrim(p_formato), ''), '{n}');
  m text[];
begin
  r := replace(r, '{anno}', to_char(p_data, 'YYYY'));
  r := replace(r, '{aa}', to_char(p_data, 'YY'));
  loop
    m := regexp_match(r, '\{n:(\d{1,2})\}');
    exit when m is null;
    r := regexp_replace(r, '\{n:\d{1,2}\}',
                        lpad(p_n::text, greatest(m[1]::integer, length(p_n::text)), '0'));
  end loop;
  return replace(r, '{n}', p_n::text);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_oda_number(p_company_id uuid, p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_year text;
  v_next integer;
  v_formato text;
  v_num text;
  v_giri integer := 0;
begin
  if not public.user_can_access_company(p_company_id) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  if p_supplier_id is not null then
    loop
      update public.suppliers s
         set oda_prossimo = s.oda_prossimo + 1
       where s.id = p_supplier_id
         and s.company_id = p_company_id
         and s.oda_prossimo is not null
      returning s.oda_prossimo - 1, coalesce(nullif(btrim(s.oda_formato), ''), '{n}')
        into v_next, v_formato;
      exit when not found;
      v_num := public.oda_formatta_numero(v_formato, v_next, current_date);
      if not exists (select 1 from public.purchase_orders po
                      where po.company_id = p_company_id and po.oda_number = v_num) then
        return v_num;
      end if;
      v_giri := v_giri + 1;
      if v_giri >= 1000 then
        raise exception 'Numerazione del fornitore: 1000 numeri di fila già usati, controlla il prossimo numero nella sua scheda'
          using errcode = 'P0001';
      end if;
    end loop;
  end if;

  loop
    update public.numerazione_ordini_fornitore n
       set prossimo = n.prossimo + 1
     where n.company_id = p_company_id
    returning n.prossimo - 1, n.formato into v_next, v_formato;
    exit when not found;
    v_num := public.oda_formatta_numero(v_formato, v_next, current_date);
    if not exists (select 1 from public.purchase_orders po
                    where po.company_id = p_company_id and po.oda_number = v_num) then
      return v_num;
    end if;
    v_giri := v_giri + 1;
    if v_giri >= 1000 then
      raise exception 'Numerazione degli ordini: 1000 numeri di fila già usati, controlla il prossimo numero nelle impostazioni'
        using errcode = 'P0001';
    end if;
  end loop;

  v_year := extract(year from current_date)::text;
  select coalesce(max(substring(oda_number from '^ODA-' || v_year || '-(\d+)$')::integer), 0) + 1
    into v_next
  from public.purchase_orders
  where company_id = p_company_id
    and oda_number ~ ('^ODA-' || v_year || '-\d+$');

  return 'ODA-' || v_year || '-' || lpad(v_next::text, greatest(4,length(v_next::text)), '0');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.operational_oda_number_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(hashtextextended('operational-oda:' || new.company_id::text, 0));
  return new;
end $function$
;
DROP TRIGGER IF EXISTS a0_operational_oda_number_lock ON public.purchase_orders;
CREATE TRIGGER a0_operational_oda_number_lock BEFORE INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION operational_oda_number_lock();
CREATE OR REPLACE FUNCTION public.auto_assign_oda_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.oda_number := nullif(btrim(coalesce(new.oda_number, '')), '');
  if new.oda_number is null then
    new.oda_number := public.generate_oda_number(new.company_id, new.supplier_id);
  end if;
  return new;
end;
$function$
;
DROP TRIGGER IF EXISTS trg_auto_oda_number ON public.purchase_orders;
CREATE TRIGGER trg_auto_oda_number BEFORE INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION auto_assign_oda_number();
CREATE OR REPLACE FUNCTION public.recalc_purchase_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po_id UUID;
BEGIN
  v_po_id := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);

  UPDATE purchase_orders SET
    subtotal = COALESCE((SELECT SUM(line_total) FROM purchase_order_items WHERE purchase_order_id = v_po_id), 0),
    vat_total = COALESCE((SELECT SUM(vat_amount) FROM purchase_order_items WHERE purchase_order_id = v_po_id), 0),
    total = COALESCE((SELECT SUM(line_total + vat_amount) FROM purchase_order_items WHERE purchase_order_id = v_po_id), 0),
    updated_at = now()
  WHERE id = v_po_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;
DROP TRIGGER IF EXISTS trg_recalc_po_totals ON public.purchase_order_items;
CREATE TRIGGER trg_recalc_po_totals AFTER INSERT OR DELETE OR UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION recalc_purchase_order_totals();

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM('super_admin','company_admin','company_staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.warehouse_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),warehouse_id uuid,user_id uuid,active boolean DEFAULT true);
CREATE TABLE IF NOT EXISTS public.multi_company_access(user_id uuid,company_id uuid,status text,expires_at timestamptz,access_role text);
CREATE OR REPLACE FUNCTION public.get_user_company_id(u uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT company FROM public.fixture_permissions WHERE actor=u ORDER BY company LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT r='company_admin' AND EXISTS(SELECT 1 FROM public.fixture_permissions WHERE actor=u AND permission='fixture_company_admin') $$;

-- Colonne della fixture lette dalle funzioni di valorizzazione verificate.
CREATE TABLE IF NOT EXISTS public.warehouse_lot_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,stock_item_id uuid,supplier_id uuid,quantity numeric,unit_cost numeric,lot_number text,expiry_date date,received_date date);
CREATE OR REPLACE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.get_user_company_id(auth.uid()) $$;
