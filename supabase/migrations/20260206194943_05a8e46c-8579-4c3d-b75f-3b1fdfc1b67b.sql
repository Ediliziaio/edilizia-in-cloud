-- Nuovi campi per stato pagamenti
ALTER TABLE public.orders
ADD COLUMN deposit_paid BOOLEAN DEFAULT false,
ADD COLUMN deposit_paid_date DATE,
ADD COLUMN deposit_2_paid BOOLEAN DEFAULT false,
ADD COLUMN deposit_2_paid_date DATE,
ADD COLUMN balance_paid BOOLEAN DEFAULT false,
ADD COLUMN balance_paid_date DATE,
ADD COLUMN balance_expected_date DATE;