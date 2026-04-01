-- ============================================================
-- Migration 03: Trasferimenti inter-magazzino
-- Sprint 1 Multi-Magazzino — Edilizia in Cloud
-- ============================================================

CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'bozza'
    CHECK (status IN ('bozza', 'confermato', 'in_transito', 'ricevuto', 'annullato')),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_different_warehouses CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.warehouse_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.warehouse_stock(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  quantity_received numeric(12,3) NOT NULL DEFAULT 0,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indici performance
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_company
  ON public.warehouse_transfers(company_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from
  ON public.warehouse_transfers(from_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to
  ON public.warehouse_transfers(to_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_transfer
  ON public.warehouse_transfer_items(transfer_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_stock
  ON public.warehouse_transfer_items(stock_item_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_warehouse_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS warehouse_transfers_updated_at ON public.warehouse_transfers;
CREATE TRIGGER warehouse_transfers_updated_at
  BEFORE UPDATE ON public.warehouse_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_warehouse_transfers_updated_at();

-- RLS
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_warehouse_transfers" ON public.warehouse_transfers;
CREATE POLICY "company_warehouse_transfers" ON public.warehouse_transfers
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT id FROM public.companies WHERE id = public.get_user_company_id()
  ));

DROP POLICY IF EXISTS "company_warehouse_transfer_items" ON public.warehouse_transfer_items;
CREATE POLICY "company_warehouse_transfer_items" ON public.warehouse_transfer_items
  FOR ALL TO authenticated
  USING (transfer_id IN (
    SELECT id FROM public.warehouse_transfers
    WHERE company_id = public.get_user_company_id()
  ));
