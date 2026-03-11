
-- MG1a: Schema extensions only
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS quantity_reserved integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_deducted boolean DEFAULT false;

ALTER TABLE public.warehouse_stock
  ADD COLUMN IF NOT EXISTS quantity_reserved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.warehouse_movements
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id),
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS unit_cost numeric,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

CREATE TABLE IF NOT EXISTS public.warehouse_lot_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.warehouse_stock(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  supplier_id uuid REFERENCES public.suppliers(id),
  unit_cost numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_lot_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lot_batches_tenant" ON public.warehouse_lot_batches FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "lot_batches_admin" ON public.warehouse_lot_batches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.inventory_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.warehouse_stock(id) ON DELETE CASCADE,
  expected_quantity integer NOT NULL,
  counted_quantity integer NOT NULL,
  difference integer NOT NULL GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
  adjustment_applied boolean NOT NULL DEFAULT false,
  performed_by uuid NOT NULL REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audits_tenant" ON public.inventory_audits FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "audits_admin" ON public.inventory_audits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_lot_batches_stock ON public.warehouse_lot_batches(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_lot_batches_company ON public.warehouse_lot_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_audits_stock ON public.inventory_audits(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_audits_company ON public.inventory_audits(company_id);
CREATE INDEX IF NOT EXISTS idx_movements_order ON public.warehouse_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_delivery ON public.order_items(delivery_date);
