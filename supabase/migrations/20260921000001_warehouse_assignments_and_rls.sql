-- ============================================================================
-- MAGAZZINO V2 — Multi-magazzino + DDT + Assegnazione Utente
-- Riferimento: Masterprompt_Magazzino_v2.docx (sez. 3.1 → 3.7)
-- ============================================================================
-- Nota timestamp: il masterprompt indica 20260420000001_… ma l'ultima
-- migration già applicata è 20260920000001_render_economics.sql. Per evitare
-- problemi di ordinamento Supabase CLI (che rifiuta timestamp fuori ordine)
-- usiamo 20260921000001 (= 20260921_000001). Contenuto 100% conforme al masterprompt.
--
-- Policy di sicurezza:
--   • 100% idempotente — rieseguibile N volte senza side-effect.
--   • Zero-DATA-LOSS: le UPDATE di backfill sono WHERE-condizionate,
--     le SET NOT NULL avvengono dopo il backfill e falliscono fast se ci sono NULL residui.
--   • Le policy esistenti su orders/order_items NON vengono toccate (additive).
--
-- Prima di applicare in PRODUZIONE:
--   1. Backup Supabase (Dashboard → Database → Backups → Create manual backup).
--   2. Applicare prima su branch Supabase di staging.
--   3. Eseguire lo script baseline counts (sezione 7.5 del masterprompt) PRIMA
--      e DOPO la migration. I valori devono coincidere tranne staff_permissions
--      (possibile crescita per utenti con nuova assegnazione).
-- ============================================================================

-- ─── Pre-flight check: colonne chiave su warehouse_movements ────────────────
-- Le colonne attese sono già presenti in types.ts (stock_item_id, order_item_id,
-- movement_type, quantity, performed_by, warehouse_id, notes). Blocchiamo
-- se qualcuna manca per evitare trigger rotti.
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  required_cols text[] := ARRAY['stock_item_id','order_item_id','movement_type','quantity','performed_by','warehouse_id','notes'];
  c text;
BEGIN
  FOREACH c IN ARRAY required_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'warehouse_movements' AND column_name = c
    ) THEN
      missing := array_append(missing, c);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Migration abort: warehouse_movements manca delle colonne: %. Adattare la migration prima di applicarla.', missing;
  END IF;
END$$;

-- ============================================================================
-- 3.1 — Tabella warehouse_assignments (mappa N:M utente → magazzino)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.warehouse_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  is_primary_manager       boolean NOT NULL DEFAULT false,
  can_receive_goods        boolean NOT NULL DEFAULT true,
  can_ship_to_site         boolean NOT NULL DEFAULT true,
  can_transfer             boolean NOT NULL DEFAULT true,
  can_count_inventory      boolean NOT NULL DEFAULT true,
  can_view_purchase_orders boolean NOT NULL DEFAULT true,

  active      boolean     NOT NULL DEFAULT true,
  assigned_by uuid        REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_warehouse_user UNIQUE (warehouse_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_user_active
  ON public.warehouse_assignments(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_wa_warehouse_active
  ON public.warehouse_assignments(warehouse_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_wa_company
  ON public.warehouse_assignments(company_id);

-- Al massimo UN primary_manager attivo per magazzino
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_primary
  ON public.warehouse_assignments(warehouse_id)
  WHERE is_primary_manager = true AND active = true;

-- Trigger updated_at (idempotente)
CREATE OR REPLACE FUNCTION public.set_warehouse_assignments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_updated_at ON public.warehouse_assignments;
CREATE TRIGGER trg_wa_updated_at
  BEFORE UPDATE ON public.warehouse_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_warehouse_assignments_updated_at();

ALTER TABLE public.warehouse_assignments ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin: CRUD completo sulle proprie assegnazioni
DROP POLICY IF EXISTS wa_admin_manage ON public.warehouse_assignments;
CREATE POLICY wa_admin_manage ON public.warehouse_assignments
  FOR ALL TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- L'utente può leggere le proprie assegnazioni (utile al frontend per capire
-- a quali magazzini è abilitato). Non può modificarle.
DROP POLICY IF EXISTS wa_self_view ON public.warehouse_assignments;
CREATE POLICY wa_self_view ON public.warehouse_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- 3.2 — Funzioni helper (usate dalle RLS e dal frontend)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_warehouse_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(warehouse_id), ARRAY[]::uuid[])
  FROM public.warehouse_assignments
  WHERE user_id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_warehouse(p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.warehouse_assignments
    WHERE user_id = auth.uid()
      AND warehouse_id = p_warehouse_id
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_warehouse_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.warehouse_assignments
    WHERE user_id = auth.uid() AND active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_warehouse_ids()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_warehouse(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_warehouse_user()                 TO authenticated;

-- ============================================================================
-- 3.3 — Trigger auto-grant staff_permissions (upsert; NON revoca)
-- Fa emergere "Magazzino" e "Ordini" nella sidebar del magazziniere senza
-- toccare usePermissions o CompanyLayout. Idempotente via ON CONFLICT.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_grant_warehouse_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Grant ai soli eventi che rendono l'assegnazione EFFETTIVAMENTE attiva.
  -- NON revochiamo mai: la disattivazione la gestisce l'admin su staff_permissions.
  IF (TG_OP = 'INSERT' AND NEW.active = true)
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.active, false) = false AND NEW.active = true)
  THEN
    INSERT INTO public.staff_permissions (
      user_id, company_id,
      can_view_warehouse, can_edit_warehouse,
      can_view_orders
    ) VALUES (
      NEW.user_id, NEW.company_id,
      true, true,
      true
    )
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      can_view_warehouse = true,
      can_edit_warehouse = GREATEST(COALESCE(public.staff_permissions.can_edit_warehouse, false), true),
      can_view_orders    = GREATEST(COALESCE(public.staff_permissions.can_view_orders, false), true),
      updated_at         = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_grant_warehouse_perms ON public.warehouse_assignments;
CREATE TRIGGER trg_auto_grant_warehouse_perms
  AFTER INSERT OR UPDATE ON public.warehouse_assignments
  FOR EACH ROW EXECUTE FUNCTION public.auto_grant_warehouse_permissions();

-- ============================================================================
-- 3.4 — Colonne warehouse_id (+ FK DDT) su goods_receipts / ddt_ricezione
-- ============================================================================
ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS warehouse_id      uuid REFERENCES public.warehouses(id)    ON DELETE SET NULL;
ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS ddt_ricezione_id  uuid REFERENCES public.ddt_ricezione(id) ON DELETE SET NULL;

ALTER TABLE public.ddt_ricezione
  ADD COLUMN IF NOT EXISTS warehouse_id      uuid REFERENCES public.warehouses(id)    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gr_warehouse      ON public.goods_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_gr_ddt            ON public.goods_receipts(ddt_ricezione_id);
CREATE INDEX IF NOT EXISTS idx_ddt_ric_warehouse ON public.ddt_ricezione(warehouse_id);

-- Backfill: record orfani → magazzino default della company.
-- Se una company non ha is_default=true, il LIMIT 1 restituisce NULL e il record
-- resta NULL; il SET NOT NULL successivo fallirà e bisognerà rimediare a mano
-- (comportamento voluto: no silenzioso, no dato inventato).
UPDATE public.goods_receipts gr
SET warehouse_id = (
  SELECT w.id FROM public.warehouses w
  WHERE w.company_id = gr.company_id AND w.is_default = true
  LIMIT 1
)
WHERE gr.warehouse_id IS NULL;

UPDATE public.ddt_ricezione d
SET warehouse_id = (
  SELECT w.id FROM public.warehouses w
  WHERE w.company_id = d.company_id AND w.is_default = true
  LIMIT 1
)
WHERE d.warehouse_id IS NULL;

-- Guard-check pre-NOT-NULL: fallisce fast con un messaggio leggibile se
-- qualche company non ha un magazzino default (o non ha alcun magazzino).
DO $$
DECLARE
  gr_orphans int;
  ddt_orphans int;
BEGIN
  SELECT count(*) INTO gr_orphans  FROM public.goods_receipts  WHERE warehouse_id IS NULL;
  SELECT count(*) INTO ddt_orphans FROM public.ddt_ricezione   WHERE warehouse_id IS NULL;

  IF gr_orphans > 0 OR ddt_orphans > 0 THEN
    RAISE EXCEPTION
      'Migration abort: goods_receipts con warehouse_id NULL=%, ddt_ricezione con warehouse_id NULL=%. Creare un warehouse is_default=true per ogni company interessata e rilanciare.',
      gr_orphans, ddt_orphans;
  END IF;
END$$;

ALTER TABLE public.goods_receipts ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE public.ddt_ricezione  ALTER COLUMN warehouse_id SET NOT NULL;

-- ============================================================================
-- 3.5 — Trigger auto-carico stock alla ricezione merce
-- Fa upsert su warehouse_stock e crea la riga in warehouse_movements (tipo
-- 'carico'). Questo rimpiazza i carichi manuali del frontend (rimossi su
-- useGoodsReceipt se presenti).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_carico_stock_on_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_id    uuid;
  v_item_name   text;
  v_supplier_id uuid;
  v_unit_cost   numeric;
BEGIN
  -- Solo stati che corrispondono a merce effettivamente in magazzino.
  IF NEW.quality_check_status IS NULL
     OR NEW.quality_check_status NOT IN ('ok', 'partial') THEN
    RETURN NEW;
  END IF;

  -- Fallback silenzioso: se warehouse_id non è valorizzato (non dovrebbe,
  -- post-NOT-NULL, ma protezione difensiva) non facciamo nulla.
  IF NEW.warehouse_id IS NULL OR NEW.quantity_received IS NULL OR NEW.quantity_received <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT oi.name, oi.supplier_id, oi.purchase_price
    INTO v_item_name, v_supplier_id, v_unit_cost
  FROM public.order_items oi
  WHERE oi.id = NEW.order_item_id;

  IF v_item_name IS NULL THEN
    -- order_item cancellato nel frattempo: non scriviamo stock "orfano".
    RETURN NEW;
  END IF;

  -- warehouse_stock esistente per (company, warehouse, nome) — case-sensitive
  SELECT id INTO v_stock_id FROM public.warehouse_stock
  WHERE company_id = NEW.company_id
    AND warehouse_id = NEW.warehouse_id
    AND name = v_item_name
  LIMIT 1;

  IF v_stock_id IS NULL THEN
    INSERT INTO public.warehouse_stock (
      company_id, warehouse_id, name, quantity, unit_cost, supplier_id
    ) VALUES (
      NEW.company_id, NEW.warehouse_id, v_item_name,
      NEW.quantity_received, COALESCE(v_unit_cost, 0), v_supplier_id
    )
    RETURNING id INTO v_stock_id;
  ELSE
    UPDATE public.warehouse_stock
       SET quantity   = quantity + NEW.quantity_received,
           updated_at = now()
     WHERE id = v_stock_id;
  END IF;

  INSERT INTO public.warehouse_movements (
    stock_item_id, order_item_id, movement_type, quantity,
    performed_by, warehouse_id, notes, company_id
  ) VALUES (
    v_stock_id, NEW.order_item_id, 'carico', NEW.quantity_received,
    NEW.received_by, NEW.warehouse_id,
    'Auto-carico da goods_receipt ' || NEW.id::text,
    NEW.company_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_carico_stock ON public.goods_receipts;
CREATE TRIGGER trg_auto_carico_stock
  AFTER INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.auto_carico_stock_on_receipt();

-- ============================================================================
-- 3.6 — RLS scoped (6 tabelle): admin vede tutto, resto filtrato per
-- get_my_warehouse_ids(). company_id check SEMPRE presente.
-- ============================================================================

-- (1) warehouse_stock
DROP POLICY IF EXISTS warehouse_stock_company_access ON public.warehouse_stock;
DROP POLICY IF EXISTS warehouse_stock_scoped_access  ON public.warehouse_stock;
CREATE POLICY warehouse_stock_scoped_access ON public.warehouse_stock
  FOR ALL TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  );

-- (2) warehouse_movements — company_id deriva dallo stock_item_id OPPURE
-- direttamente dalla colonna company_id se valorizzata (backward compatible).
DROP POLICY IF EXISTS warehouse_movements_scoped_access ON public.warehouse_movements;
CREATE POLICY warehouse_movements_scoped_access ON public.warehouse_movements
  FOR ALL TO authenticated
  USING (
    (
      company_id = public.get_my_company_id()
      OR (SELECT s.company_id FROM public.warehouse_stock s WHERE s.id = warehouse_movements.stock_item_id) = public.get_my_company_id()
    )
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  );

-- (3) goods_receipts
DROP POLICY IF EXISTS goods_receipts_company_access ON public.goods_receipts;
DROP POLICY IF EXISTS goods_receipts_scoped_access  ON public.goods_receipts;
CREATE POLICY goods_receipts_scoped_access ON public.goods_receipts
  FOR ALL TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  );

-- (4) ddt_ricezione
DROP POLICY IF EXISTS ddt_ricezione_company_access ON public.ddt_ricezione;
DROP POLICY IF EXISTS ddt_ricezione_scoped_access  ON public.ddt_ricezione;
CREATE POLICY ddt_ricezione_scoped_access ON public.ddt_ricezione
  FOR ALL TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  );

-- (5) shipments_to_site (destination_warehouse_id)
DROP POLICY IF EXISTS shipments_company_access ON public.shipments_to_site;
DROP POLICY IF EXISTS shipments_scoped_access  ON public.shipments_to_site;
CREATE POLICY shipments_scoped_access ON public.shipments_to_site
  FOR ALL TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR destination_warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR destination_warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  );

-- (6) warehouse_transfers (from_warehouse_id OR to_warehouse_id)
DROP POLICY IF EXISTS company_warehouse_transfers        ON public.warehouse_transfers;
DROP POLICY IF EXISTS warehouse_transfers_scoped_access  ON public.warehouse_transfers;
CREATE POLICY warehouse_transfers_scoped_access ON public.warehouse_transfers
  FOR ALL TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR from_warehouse_id = ANY(public.get_my_warehouse_ids())
      OR to_warehouse_id   = ANY(public.get_my_warehouse_ids())
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR from_warehouse_id = ANY(public.get_my_warehouse_ids())
      OR to_warehouse_id   = ANY(public.get_my_warehouse_ids())
    )
  );

-- (7) purchase_orders: policy SELECT AGGIUNTIVA — il magazziniere vede i PO
-- destinati ai suoi magazzini. Le policy esistenti (company_admin/staff) NON
-- vengono toccate, il motore Postgres applica in OR.
DROP POLICY IF EXISTS purchase_orders_warehouse_view ON public.purchase_orders;
CREATE POLICY purchase_orders_warehouse_view ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.is_warehouse_user()
    AND (
      delivery_warehouse_id = ANY(public.get_my_warehouse_ids())
      OR EXISTS (
        SELECT 1 FROM public.purchase_order_items poi
        WHERE poi.purchase_order_id = purchase_orders.id
          AND poi.warehouse_id      = ANY(public.get_my_warehouse_ids())
      )
    )
  );

-- ============================================================================
-- 3.7 — RLS ADDITIVE su orders / order_items
-- NON toccare le policy esistenti (es. orders_company_select, orders_staff_*,
-- order_items_company_select, ecc.). Aggiungiamo UNA policy SELECT in più;
-- Postgres la applica in OR con quelle esistenti.
-- ============================================================================
DROP POLICY IF EXISTS orders_warehouse_user_view ON public.orders;
CREATE POLICY orders_warehouse_user_view ON public.orders
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.is_warehouse_user()
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = orders.id
        AND oi.destination_warehouse_id = ANY(public.get_my_warehouse_ids())
    )
  );

DROP POLICY IF EXISTS order_items_warehouse_user_view ON public.order_items;
CREATE POLICY order_items_warehouse_user_view ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.is_warehouse_user()
    AND destination_warehouse_id = ANY(public.get_my_warehouse_ids())
  );

-- ============================================================================
-- FINE MIGRATION — verifiche post-apply raccomandate (masterprompt §7.4/7.5):
--   • SELECT count(*) FROM <tabella>  pre/post: devono coincidere (tranne
--     staff_permissions per eventuali nuove assegnazioni).
--   • \d+ public.orders, public.order_items: le policy originali devono essere
--     ancora presenti accanto a orders_warehouse_user_view.
--   • Come magazziniere: SELECT public.is_warehouse_user();  → true
--   • Come magazziniere: SELECT public.get_my_warehouse_ids();  → solo W assegnati.
-- ============================================================================
