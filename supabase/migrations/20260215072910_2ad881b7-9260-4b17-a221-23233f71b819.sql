
-- Add payment_method to suppliers
ALTER TABLE public.suppliers ADD COLUMN payment_method text DEFAULT NULL;

-- Add installment tracking columns to order_items
ALTER TABLE public.order_items
  ADD COLUMN deposit_amount numeric DEFAULT 0,
  ADD COLUMN deposit_paid boolean DEFAULT false,
  ADD COLUMN deposit_paid_date date DEFAULT NULL,
  ADD COLUMN balance_amount numeric DEFAULT 0,
  ADD COLUMN balance_paid boolean DEFAULT false,
  ADD COLUMN balance_paid_date date DEFAULT NULL,
  ADD COLUMN balance_expected_date date DEFAULT NULL;
