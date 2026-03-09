
-- =============================================
-- STEP 2: ALTER Suppliers + Purchase Orders + OdA
-- =============================================

-- 2A. ALTER SUPPLIERS — aggiungere campi operativi
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Indice per filtro attivi
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(company_id, is_active);

-- 2B. PURCHASE_ORDERS
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  
  -- Numerazione automatica ODA-YYYY-NNNN
  oda_number TEXT NOT NULL,
  
  -- Stato workflow
  status TEXT NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza', 'inviato', 'confermato', 'parziale', 'ricevuto', 'annullato')),
  
  -- Date
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  
  -- Collegamento a ordine cliente (opzionale)
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Totali (calcolati via trigger)
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Pagamento
  payment_terms TEXT,
  payment_method TEXT,
  
  -- Note
  notes TEXT,
  internal_notes TEXT,
  
  -- Allegati
  attachment_url TEXT,
  
  -- Metadati
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint unico per numerazione OdA per azienda
ALTER TABLE public.purchase_orders ADD CONSTRAINT uq_oda_number_company UNIQUE (company_id, oda_number);

-- Indici purchase_orders
CREATE INDEX idx_po_company_id ON public.purchase_orders(company_id);
CREATE INDEX idx_po_supplier ON public.purchase_orders(company_id, supplier_id);
CREATE INDEX idx_po_status ON public.purchase_orders(company_id, status);
CREATE INDEX idx_po_order ON public.purchase_orders(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_po_issue_date ON public.purchase_orders(company_id, issue_date);

-- RLS purchase_orders
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_tenant_select" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "po_tenant_insert" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "po_tenant_update" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "po_tenant_delete" ON public.purchase_orders
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "po_super_admin" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 2C. PURCHASE_ORDER_ITEMS
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  -- Articolo
  description TEXT NOT NULL,
  sku TEXT,
  unit_of_measure TEXT DEFAULT 'pz',
  
  -- Quantità e prezzi
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 22,
  
  -- Calcolati
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (
    ROUND(quantity * unit_price * (1 - discount_percent / 100), 2)
  ) STORED,
  vat_amount NUMERIC(12,2) GENERATED ALWAYS AS (
    ROUND(quantity * unit_price * (1 - discount_percent / 100) * vat_rate / 100, 2)
  ) STORED,
  
  -- Ricezione parziale
  quantity_received NUMERIC(12,3) NOT NULL DEFAULT 0,
  received_date DATE,
  
  -- Collegamento a articolo template (opzionale)
  article_template_id UUID REFERENCES public.article_templates(id) ON DELETE SET NULL,
  
  -- Ordinamento
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Metadati
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici purchase_order_items
CREATE INDEX idx_poi_company ON public.purchase_order_items(company_id);
CREATE INDEX idx_poi_po ON public.purchase_order_items(purchase_order_id);

-- RLS purchase_order_items
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poi_tenant_select" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "poi_tenant_insert" ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "poi_tenant_update" ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "poi_tenant_delete" ON public.purchase_order_items
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "poi_super_admin" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- =============================================
-- 2D. TRIGGER: Ricalcolo totali OdA
-- =============================================
CREATE OR REPLACE FUNCTION public.recalc_purchase_order_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE TRIGGER trg_recalc_po_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_purchase_order_totals();

-- =============================================
-- 2E. FUNZIONE: Generazione numero OdA automatico
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_oda_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM purchase_orders
  WHERE company_id = p_company_id
    AND oda_number LIKE 'ODA-' || v_year || '-%';
  
  RETURN 'ODA-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$;

-- =============================================
-- 2F. FUNZIONE: Crea OdA da ordine cliente
-- =============================================
CREATE OR REPLACE FUNCTION public.create_oda_from_order(
  p_order_id UUID,
  p_supplier_id UUID,
  p_company_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oda_id UUID;
  v_oda_number TEXT;
BEGIN
  -- Verify access
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND company_id = p_company_id)
     AND NOT has_role(p_user_id, 'super_admin') THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;
  
  -- Generate OdA number
  v_oda_number := generate_oda_number(p_company_id);
  
  -- Create purchase order
  INSERT INTO purchase_orders (
    company_id, supplier_id, oda_number, order_id, 
    payment_terms, created_by
  ) VALUES (
    p_company_id, p_supplier_id, v_oda_number, p_order_id,
    (SELECT payment_method FROM suppliers WHERE id = p_supplier_id),
    p_user_id
  ) RETURNING id INTO v_oda_id;
  
  -- Copy order items to purchase order items
  INSERT INTO purchase_order_items (
    company_id, purchase_order_id, description, sku, unit_of_measure,
    quantity, unit_price, vat_rate, sort_order, article_template_id
  )
  SELECT
    p_company_id,
    v_oda_id,
    oi.name,
    at.sku,
    COALESCE(oi.unit_of_measure, 'pz'),
    oi.quantity,
    COALESCE(at.standard_cost, oi.unit_price),
    COALESCE(oi.vat_rate, 22),
    oi.sort_order,
    oi.article_template_id
  FROM order_items oi
  LEFT JOIN article_templates at ON at.id = oi.article_template_id
  WHERE oi.order_id = p_order_id;
  
  RETURN v_oda_id;
END;
$$;

-- =============================================
-- 2G. TRIGGER updated_at per suppliers e PO
-- =============================================
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_po_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_poi_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Fix Step 1 RLS: use get_my_company_id() instead of subquery for consistency
DROP POLICY IF EXISTS "scadenze_tenant_select" ON public.scadenze;
DROP POLICY IF EXISTS "scadenze_tenant_insert" ON public.scadenze;
DROP POLICY IF EXISTS "scadenze_tenant_update" ON public.scadenze;
DROP POLICY IF EXISTS "scadenze_tenant_delete" ON public.scadenze;

CREATE POLICY "scadenze_tenant_select" ON public.scadenze
  FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "scadenze_tenant_insert" ON public.scadenze
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "scadenze_tenant_update" ON public.scadenze
  FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "scadenze_tenant_delete" ON public.scadenze
  FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "prima_nota_tenant_select" ON public.prima_nota_entries;
DROP POLICY IF EXISTS "prima_nota_tenant_insert" ON public.prima_nota_entries;
DROP POLICY IF EXISTS "prima_nota_tenant_update" ON public.prima_nota_entries;
DROP POLICY IF EXISTS "prima_nota_tenant_delete" ON public.prima_nota_entries;

CREATE POLICY "prima_nota_tenant_select" ON public.prima_nota_entries
  FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "prima_nota_tenant_insert" ON public.prima_nota_entries
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "prima_nota_tenant_update" ON public.prima_nota_entries
  FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "prima_nota_tenant_delete" ON public.prima_nota_entries
  FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());
