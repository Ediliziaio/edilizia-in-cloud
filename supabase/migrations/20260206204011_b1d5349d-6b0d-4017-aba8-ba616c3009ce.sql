-- Add order_code column for order identification
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_code TEXT;