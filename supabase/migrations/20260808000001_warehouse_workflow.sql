-- ============================================================
-- WAREHOUSE WORKFLOW — Magazzino + Trasporto + Consegna + Installazione
-- ============================================================

-- ============================================================
-- GOODS_RECEIPTS: Ricezione merce in magazzino
-- ============================================================
CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  company_id uuid not null references companies(id),
  supplier_id uuid references suppliers(id),

  receipt_date timestamp default now(),
  quantity_received integer not null check (quantity_received > 0),
  ddt_number text,
  ddt_photo_url text,

  received_by uuid not null references auth.users(id),
  notes text,

  quality_check_status text check (quality_check_status in ('ok', 'damaged', 'partial', 'pending')) default 'ok',
  quality_notes text,

  created_at timestamp default now(),
  updated_at timestamp default now()
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_order_item ON goods_receipts(order_item_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_company ON goods_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_date ON goods_receipts(receipt_date);

-- ============================================================
-- SHIPMENTS_TO_SITE: Trasporto verso cantiere
-- ============================================================
CREATE TABLE IF NOT EXISTS shipments_to_site (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  company_id uuid not null references companies(id),

  shipment_date timestamp default now(),
  transporter_id uuid not null references auth.users(id),
  destination_warehouse_id uuid references warehouses(id),

  items_json jsonb not null,

  shipment_ddt_number text not null,
  shipment_ddt_photo_url text,
  loading_photo_url text,

  departed_at timestamp,
  arrived_at timestamp,

  status text check (status in ('pending', 'in_transit', 'delivered', 'rejected')) default 'pending',

  created_at timestamp default now(),
  updated_at timestamp default now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments_to_site(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments_to_site(status);
CREATE INDEX IF NOT EXISTS idx_shipments_company ON shipments_to_site(company_id);

-- ============================================================
-- SITE_DELIVERIES: Consegna al cantiere
-- ============================================================
CREATE TABLE IF NOT EXISTS site_deliveries (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments_to_site(id) on delete cascade,
  order_id uuid not null references orders(id),
  company_id uuid not null references companies(id),

  delivery_date timestamp default now(),
  received_by_name text not null,
  received_by_user_id uuid references auth.users(id),

  delivery_photo_url text not null,
  signature_photo_url text not null,

  quality_status text check (quality_status in ('ok', 'partial', 'damaged')) default 'ok',
  quantity_delivered integer,
  delivery_notes text,

  status text check (status in ('delivered', 'rejected')) default 'delivered',

  created_at timestamp default now(),
  updated_at timestamp default now()
);

CREATE INDEX IF NOT EXISTS idx_site_deliveries_shipment ON site_deliveries(shipment_id);
CREATE INDEX IF NOT EXISTS idx_site_deliveries_order ON site_deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_site_deliveries_company ON site_deliveries(company_id);

-- ============================================================
-- INSTALLATIONS: Installazioni materiale
-- ============================================================
CREATE TABLE IF NOT EXISTS installations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  site_delivery_id uuid references site_deliveries(id),
  company_id uuid not null references companies(id),

  installer_id uuid not null references auth.users(id),

  installation_location text,

  photo_before_url text not null,
  photo_after_url text not null,

  started_at timestamp,
  completed_at timestamp,

  status text check (status in ('pending', 'in_progress', 'completed', 'rejected')) default 'pending',
  notes text,

  created_at timestamp default now(),
  updated_at timestamp default now()
);

CREATE INDEX IF NOT EXISTS idx_installations_order_item ON installations(order_item_id);
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
CREATE INDEX IF NOT EXISTS idx_installations_company ON installations(company_id);

-- ============================================================
-- ORDER_ITEM_TIMELINE: Timeline eventi
-- ============================================================
CREATE TABLE IF NOT EXISTS order_item_timeline (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  company_id uuid not null references companies(id),

  event_type text not null check (event_type in (
    'ordered', 'in_transit', 'received', 'quality_check',
    'ready_to_ship', 'shipped', 'in_transit_site', 'delivered_site',
    'installation_started', 'installation_completed'
  )),

  event_date timestamp default now(),
  event_by uuid not null references auth.users(id),

  photo_url text,
  document_ref uuid,

  notes text,
  location text,

  created_at timestamp default now()
);

CREATE INDEX IF NOT EXISTS idx_order_item_timeline_item ON order_item_timeline(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_timeline_event ON order_item_timeline(event_type);
CREATE INDEX IF NOT EXISTS idx_order_item_timeline_company ON order_item_timeline(company_id);

-- ============================================================
-- ALTER order_items — aggiungi colonne warehouse
-- ============================================================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity_received integer default 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS receipt_id uuid references goods_receipts(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS last_goods_receipt_date timestamp;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS shipment_id uuid references shipments_to_site(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS last_shipment_date timestamp;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS installation_id uuid references installations(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfillment_status text check (
  fulfillment_status in ('not_started', 'received', 'shipped', 'delivered', 'installed')
) default 'not_started';

-- ============================================================
-- ALTER orders — aggiungi fulfillment_status
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status text check (
  fulfillment_status in (
    'not_started', 'partial', 'ready_to_ship', 'in_shipping',
    'delivered', 'partial_installed', 'completed'
  )
) default 'not_started';

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments_to_site ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goods_receipts_company_access" ON goods_receipts;
CREATE POLICY "goods_receipts_company_access" ON goods_receipts
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "shipments_company_access" ON shipments_to_site;
CREATE POLICY "shipments_company_access" ON shipments_to_site
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "site_deliveries_company_access" ON site_deliveries;
CREATE POLICY "site_deliveries_company_access" ON site_deliveries
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "installations_company_access" ON installations;
CREATE POLICY "installations_company_access" ON installations
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "timeline_company_access" ON order_item_timeline;
CREATE POLICY "timeline_company_access" ON order_item_timeline
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('goods_receipts', 'goods_receipts', false),
  ('shipments_to_site', 'shipments_to_site', false),
  ('site_deliveries', 'site_deliveries', false),
  ('installations', 'installations', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "goods_receipts_storage_select" ON storage.objects;
CREATE POLICY "goods_receipts_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'goods_receipts' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "goods_receipts_storage_insert" ON storage.objects;
CREATE POLICY "goods_receipts_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'goods_receipts' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "shipments_storage_select" ON storage.objects;
CREATE POLICY "shipments_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'shipments_to_site' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "shipments_storage_insert" ON storage.objects;
CREATE POLICY "shipments_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'shipments_to_site' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "site_deliveries_storage_select" ON storage.objects;
CREATE POLICY "site_deliveries_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'site_deliveries' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "site_deliveries_storage_insert" ON storage.objects;
CREATE POLICY "site_deliveries_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'site_deliveries' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "installations_storage_select" ON storage.objects;
CREATE POLICY "installations_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'installations' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "installations_storage_insert" ON storage.objects;
CREATE POLICY "installations_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'installations' AND auth.role() = 'authenticated');
