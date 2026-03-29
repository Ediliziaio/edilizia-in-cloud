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
