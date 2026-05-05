-- ============================================================
-- QR WAREHOUSE FOUNDATION (MP1 — P0)
-- ============================================================
-- Estende warehouse_stock con barcode/internal_code/tracking_mode
-- Estende suppliers con preferenze QR (prefix, GS1, default format)
-- Crea stock_units (tracking serializzato per singolo pezzo)
-- Crea warehouse_scan_events (audit trail di tutte le scansioni)
-- Crea RPC warehouse_scan_lookup (cascata di risoluzione codice)
--
-- Idempotente: tutto con IF NOT EXISTS / OR REPLACE.
-- Rollback: vedi sezione COMMIT inversa nel masterprompt MP1.
-- ============================================================

BEGIN;

-- ─── 1) warehouse_stock: estensioni QR ─────────────────────────
ALTER TABLE public.warehouse_stock
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS internal_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'fungible'
    CHECK (tracking_mode IN ('fungible', 'serialized')),
  ADD COLUMN IF NOT EXISTS requires_warranty BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_warranty_months INTEGER,
  ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_stock_barcode_company
  ON public.warehouse_stock(company_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_stock_internal_code_company
  ON public.warehouse_stock(company_id, internal_code)
  WHERE internal_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_barcode_supplier
  ON public.warehouse_stock(company_id, supplier_id, barcode)
  WHERE barcode IS NOT NULL;

COMMENT ON COLUMN public.warehouse_stock.barcode IS
  'Codice barcode/QR del fornitore (EAN-13, GTIN, codice produttore). Nullable. Unique per company.';
COMMENT ON COLUMN public.warehouse_stock.internal_code IS
  'Codice interno auto-generato dal gestionale (EIC-<prefix>-<seq36>). Usato quando il fornitore non ha QR.';
COMMENT ON COLUMN public.warehouse_stock.tracking_mode IS
  'fungible = articoli identici (viti, tubi, cemento). serialized = ogni pezzo ha seriale univoco (pannelli FV, caldaie). Se serialized, giacenza reale = COUNT(stock_units WHERE status=available).';

-- ─── 2) suppliers: estensioni QR ───────────────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS barcode_prefix TEXT,
  ADD COLUMN IF NOT EXISTS uses_gs1 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_qr_format TEXT
    CHECK (default_qr_format IS NULL OR default_qr_format IN
      ('ean13', 'gtin14', 'gs1_128', 'gs1_qr', 'custom'));

COMMENT ON COLUMN public.suppliers.barcode_prefix IS
  'Prefisso barcode tipico di questo fornitore (es. 800012). Usato per matching probabilistico.';
COMMENT ON COLUMN public.suppliers.uses_gs1 IS
  'Se true, gli scan vanno passati al parser GS1 (gs1Parser.ts) anche senza euristica.';
COMMENT ON COLUMN public.suppliers.default_qr_format IS
  'Formato QR di default per stampa etichette: ean13, gtin14, gs1_128, gs1_qr, custom.';

-- Compatibilità catena migrazioni pulita:
-- stock_units e scan_events referenziano warehouses, ma la tabella formale
-- multi-magazzino nasce più avanti (20260802000001). La creiamo qui con lo
-- stesso schema perché le FK siano valide già in MP1.
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'main'
    CHECK (type IN ('main', 'secondary', 'site', 'vehicle')),
  address text,
  city text,
  province text,
  postal_code text,
  contact_name text,
  contact_phone text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  linked_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_default
  ON public.warehouses(company_id) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_warehouses_company
  ON public.warehouses(company_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_type
  ON public.warehouses(company_id, type);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- ─── 3) stock_units: tracking per singolo pezzo seriale ────────
CREATE TABLE IF NOT EXISTS public.stock_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.warehouse_stock(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  lotto_id UUID REFERENCES public.stock_lotti(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'shipped',
                      'installed', 'returned', 'defective', 'scrapped')),
  -- Locazione fisica
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.warehouse_sections(id) ON DELETE SET NULL,
  -- Acquisto
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_price NUMERIC(12, 2),
  purchase_ddt_ricezione_id UUID,
  purchase_date DATE,
  -- Assegnazione/consegna (popolati in MP3)
  reserved_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  delivered_shipment_id UUID,
  delivered_at TIMESTAMPTZ,
  delivered_to_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  -- Garanzia (calcolata)
  warranty_start_date DATE,
  warranty_months INTEGER,
  -- warranty_expires_at era originariamente GENERATED ALWAYS AS, ma Postgres
  -- considera `date + (text || ' months')::interval` non IMMUTABLE
  -- (errore 42P17). La calcoliamo via trigger BEFORE INSERT/UPDATE: stesso
  -- risultato funzionale, compatibile con qualsiasi versione Postgres.
  warranty_expires_at DATE,
  manufacturer_warranty_code TEXT,
  -- Installazione (popolato in fase futura P2)
  installed_at TIMESTAMPTZ,
  installed_at_location TEXT,
  installed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_units_serial_company
  ON public.stock_units(company_id, serial_number);
CREATE INDEX IF NOT EXISTS idx_stock_units_item_status
  ON public.stock_units(stock_item_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_units_order
  ON public.stock_units(delivered_to_order_id)
  WHERE delivered_to_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_units_warranty
  ON public.stock_units(company_id, warranty_expires_at)
  WHERE warranty_expires_at IS NOT NULL;

ALTER TABLE public.stock_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_units_company_access" ON public.stock_units;
CREATE POLICY "stock_units_company_access"
  ON public.stock_units FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.stock_units_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Calcolo automatico di warranty_expires_at al posto della GENERATED column.
-- Si attiva quando l'utente popola/aggiorna warranty_start_date o warranty_months.
-- Se uno dei due è NULL, expires_at torna NULL (consistente con la vecchia logica).
CREATE OR REPLACE FUNCTION public.stock_units_compute_warranty_expires()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.warranty_start_date IS NOT NULL AND NEW.warranty_months IS NOT NULL THEN
    NEW.warranty_expires_at :=
      (NEW.warranty_start_date + make_interval(months => NEW.warranty_months))::DATE;
  ELSE
    NEW.warranty_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_units_warranty ON public.stock_units;
CREATE TRIGGER trg_stock_units_warranty
  BEFORE INSERT OR UPDATE OF warranty_start_date, warranty_months
  ON public.stock_units
  FOR EACH ROW EXECUTE FUNCTION public.stock_units_compute_warranty_expires();

DROP TRIGGER IF EXISTS trg_stock_units_updated_at ON public.stock_units;
CREATE TRIGGER trg_stock_units_updated_at
  BEFORE UPDATE ON public.stock_units
  FOR EACH ROW EXECUTE FUNCTION public.stock_units_set_updated_at();

-- ─── 4) warehouse_scan_events: audit trail scansioni ───────────
CREATE TABLE IF NOT EXISTS public.warehouse_scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  scanned_code TEXT NOT NULL,
  scan_format TEXT,
  scan_type TEXT NOT NULL
    CHECK (scan_type IN ('lookup', 'carico', 'scarico',
                         'inventario', 'transfer', 'return', 'oda_receive')),
  -- Risoluzione
  resolved_stock_item_id UUID REFERENCES public.warehouse_stock(id) ON DELETE SET NULL,
  resolved_stock_unit_id UUID REFERENCES public.stock_units(id) ON DELETE SET NULL,
  resolution_status TEXT NOT NULL
    CHECK (resolution_status IN ('matched', 'matched_ambiguous',
                                 'new_item_created', 'unresolved', 'rejected')),
  -- Contesto operativo
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  quantity NUMERIC(12, 3),
  -- Device/geo (utili per offline sync e debug)
  gps_latitude NUMERIC(10, 7),
  gps_longitude NUMERIC(10, 7),
  device_info JSONB,
  synced_from_offline BOOLEAN NOT NULL DEFAULT false,
  offline_client_uuid UUID,
  offline_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_events_company_date
  ON public.warehouse_scan_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_user
  ON public.warehouse_scan_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_item
  ON public.warehouse_scan_events(resolved_stock_item_id)
  WHERE resolved_stock_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_events_offline_uuid
  ON public.warehouse_scan_events(offline_client_uuid)
  WHERE offline_client_uuid IS NOT NULL;

ALTER TABLE public.warehouse_scan_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan_events_company_select" ON public.warehouse_scan_events;
CREATE POLICY "scan_events_company_select"
  ON public.warehouse_scan_events FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "scan_events_insert_own" ON public.warehouse_scan_events;
CREATE POLICY "scan_events_insert_own"
  ON public.warehouse_scan_events FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

-- ─── 5) RPC warehouse_scan_lookup (cascata risoluzione) ────────
CREATE OR REPLACE FUNCTION public.warehouse_scan_lookup(
  p_code TEXT,
  p_supplier_id UUID DEFAULT NULL
)
RETURNS TABLE (
  match_type TEXT,
  stock_unit_id UUID,
  stock_item_id UUID,
  item_name TEXT,
  item_barcode TEXT,
  item_tracking_mode TEXT,
  current_quantity NUMERIC,
  supplier_id UUID,
  supplier_name TEXT,
  unit_status TEXT,
  warehouse_id UUID,
  warehouse_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;

  v_company_id := public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user';
  END IF;

  -- Livello 1: match esatto su stock_units.serial_number (univoco)
  RETURN QUERY
    SELECT
      'unit'::TEXT,
      su.id,
      su.stock_item_id,
      ws.name,
      ws.barcode,
      ws.tracking_mode,
      ws.quantity::NUMERIC,
      su.supplier_id,
      s.name,
      su.status,
      su.warehouse_id,
      w.name
    FROM public.stock_units su
    JOIN public.warehouse_stock ws ON ws.id = su.stock_item_id
    LEFT JOIN public.suppliers s ON s.id = su.supplier_id
    LEFT JOIN public.warehouses w ON w.id = su.warehouse_id
    WHERE su.company_id = v_company_id
      AND su.serial_number = p_code
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Livello 2: match su warehouse_stock.barcode/internal_code
  -- Preferenza: stesso supplier > altro supplier (item_ambiguous)
  RETURN QUERY
    SELECT
      CASE
        WHEN p_supplier_id IS NOT NULL AND ws.supplier_id = p_supplier_id THEN 'item'
        WHEN p_supplier_id IS NOT NULL AND ws.supplier_id IS DISTINCT FROM p_supplier_id THEN 'item_ambiguous'
        ELSE 'item'
      END::TEXT,
      NULL::UUID,
      ws.id,
      ws.name,
      ws.barcode,
      ws.tracking_mode,
      ws.quantity::NUMERIC,
      ws.supplier_id,
      s.name,
      NULL::TEXT,
      ws.warehouse_id,
      w.name
    FROM public.warehouse_stock ws
    LEFT JOIN public.suppliers s ON s.id = ws.supplier_id
    LEFT JOIN public.warehouses w ON w.id = ws.warehouse_id
    WHERE ws.company_id = v_company_id
      AND (ws.barcode = p_code OR ws.internal_code = p_code)
    ORDER BY
      CASE WHEN ws.supplier_id = p_supplier_id THEN 0 ELSE 1 END,
      ws.updated_at DESC
    LIMIT 5;
  IF FOUND THEN RETURN; END IF;

  -- Livello 3: nessun match (caller mostra dialog "nuovo articolo")
  RETURN QUERY
    SELECT 'none'::TEXT, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT,
           NULL::TEXT, NULL::NUMERIC, NULL::UUID, NULL::TEXT, NULL::TEXT,
           NULL::UUID, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_scan_lookup(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.warehouse_scan_lookup(TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.warehouse_scan_lookup IS
  'Risoluzione in cascata codice scansionato: 1) seriale unità → match unit, 2) barcode articolo (pref. stesso supplier) → match item | item_ambiguous, 3) nessun match → none. Sicurezza: tied to company via get_my_company_id().';

COMMIT;
