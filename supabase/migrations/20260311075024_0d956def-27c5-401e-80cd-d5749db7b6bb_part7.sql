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
