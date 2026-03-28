ALTER TABLE public.warehouse_stock
  ADD COLUMN IF NOT EXISTS quantity_reserved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_quantity integer NOT NULL DEFAULT 0;
