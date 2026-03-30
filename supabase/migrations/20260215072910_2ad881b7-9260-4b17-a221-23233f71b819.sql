
-- Add payment_method to suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_method text DEFAULT NULL;

-- Add installment tracking columns to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_paid_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS balance_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_paid_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS balance_expected_date date DEFAULT NULL;
