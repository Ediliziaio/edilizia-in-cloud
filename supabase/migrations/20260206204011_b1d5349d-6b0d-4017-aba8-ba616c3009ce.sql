-- Add order_code column for order identification
ALTER TABLE public.orders
ADD COLUMN order_code TEXT;