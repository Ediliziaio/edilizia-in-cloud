
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS financing_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS financing_paid_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS financing_expected_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS financing_cost numeric DEFAULT 0;
