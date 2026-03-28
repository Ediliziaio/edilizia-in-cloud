-- MG1a: Schema extensions only
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS quantity_reserved integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_deducted boolean DEFAULT false;
