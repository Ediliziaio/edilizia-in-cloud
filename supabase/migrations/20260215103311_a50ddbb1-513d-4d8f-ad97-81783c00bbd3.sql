ALTER TABLE public.order_employees ADD COLUMN is_paid boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_employees ADD COLUMN paid_date date;