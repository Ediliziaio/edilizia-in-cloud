ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS paid_date date;