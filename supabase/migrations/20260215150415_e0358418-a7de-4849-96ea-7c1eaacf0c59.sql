
ALTER TABLE public.orders
  ADD COLUMN financing_paid boolean DEFAULT false,
  ADD COLUMN financing_paid_date date DEFAULT NULL,
  ADD COLUMN financing_expected_date date DEFAULT NULL,
  ADD COLUMN financing_cost numeric DEFAULT 0;
