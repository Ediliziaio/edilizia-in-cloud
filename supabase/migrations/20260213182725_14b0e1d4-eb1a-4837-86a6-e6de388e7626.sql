ALTER TABLE public.order_items ADD COLUMN is_paid boolean DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN paid_date date;