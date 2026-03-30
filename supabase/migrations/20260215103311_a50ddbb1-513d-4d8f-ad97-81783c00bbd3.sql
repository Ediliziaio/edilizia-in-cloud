ALTER TABLE public.order_employees ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_employees ADD COLUMN IF NOT EXISTS paid_date date;