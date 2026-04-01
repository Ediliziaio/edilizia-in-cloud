-- ============================================================
-- Migration 02: Aggiunge warehouse_id alle tabelle esistenti
-- Sprint 1 Multi-Magazzino — Edilizia in Cloud
-- ============================================================

-- 1. warehouse_sections → warehouse_id (NULL = visibile in tutti i magazzini)
ALTER TABLE public.warehouse_sections
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_sections_warehouse
  ON public.warehouse_sections(warehouse_id);

-- 2. warehouse_stock → warehouse_id
ALTER TABLE public.warehouse_stock
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse
  ON public.warehouse_stock(warehouse_id);

-- 3. warehouse_movements → warehouse_id (magazzino di competenza del movimento)
ALTER TABLE public.warehouse_movements
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_movements_warehouse
  ON public.warehouse_movements(warehouse_id);

-- 4. purchase_orders → delivery_warehouse_id (magazzino di destinazione ODA)
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_delivery_warehouse
  ON public.purchase_orders(delivery_warehouse_id);

-- 5. purchase_order_items → warehouse_id (magazzino destinazione singola riga)
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- 6. order_items → destination_warehouse_id (magazzino prelievo/consegna)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
